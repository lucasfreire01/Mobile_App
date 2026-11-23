import db from '@adonisjs/lucid/services/db'
import type { HttpContext } from '@adonisjs/core/http'
import { DateTime } from 'luxon'
import env from '#start/env'
import WorkerHeartbeat from '#models/worker_heartbeat'
import { GATEWAY_NETWORK_OPERATIONS_WORKER } from '#services/worker_heartbeat_service'
import { SSH_HOST_KEY_MISMATCH_ALERT } from '#services/gateway_security_alert_service'
import SharedCacheService from '#services/shared_cache_service'

type HealthPayload = {
  status: string
  queue: Record<string, number | null>
  worker: Record<string, string | number | null>
}
let cachedHealth: { expiresAt: number; payload: HealthPayload } | null = null

export default class QueueHealthsController {
  async show({ response }: HttpContext) {
    const sharedCache = new SharedCacheService()
    const shared = await sharedCache.get<HealthPayload>('health:queue')
    if (shared) {
      response.header('Cache-Control', 'private, max-age=5')
      return response.ok(shared)
    }
    if (cachedHealth && cachedHealth.expiresAt > Date.now()) {
      response.header('Cache-Control', 'private, max-age=5')
      return response.ok(cachedHealth.payload)
    }
    const maxPendingAgeSeconds = env.get('QUEUE_HEALTH_MAX_PENDING_AGE_SECONDS', 300)
    const maxWorkerAgeSeconds = env.get('QUEUE_HEALTH_MAX_WORKER_AGE_SECONDS', 60)
    const hostKeyMismatchWindowSeconds = env.get(
      'QUEUE_HEALTH_HOST_KEY_MISMATCH_WINDOW_SECONDS',
      900
    )
    const hostKeyMismatchSince = DateTime.now()
      .minus({ seconds: hostKeyMismatchWindowSeconds })
      .toJSDate()

    const countByStatus = async (status: string) => {
      const result = await db
        .from('gateway_network_operations')
        .where('status', status)
        .count('* as total')
        .first()

      return Number(result?.total ?? 0)
    }

    const [
      pending,
      applying,
      failed,
      expiredLeases,
      recentHostKeyMismatches,
      openHostKeyMismatchAlerts,
      oldestPendingOperation,
      workerHeartbeat,
    ] = await Promise.all([
      countByStatus('pending'),
      countByStatus('applying'),
      countByStatus('failed'),
      db
        .from('gateway_network_operations')
        .where('status', 'applying')
        .whereNotNull('processing_expires_at')
        .where('processing_expires_at', '<', new Date())
        .count('* as total')
        .first()
        .then((result) => Number(result?.total ?? 0)),
      db
        .from('gateway_network_operations')
        .where('error_code', 'E_GATEWAY_SSH_HOST_KEY_MISMATCH')
        .where('updated_at', '>=', hostKeyMismatchSince)
        .count('* as total')
        .first()
        .then((result) => Number(result?.total ?? 0)),
      db
        .from('gateway_security_alerts')
        .where('type', SSH_HOST_KEY_MISMATCH_ALERT)
        .where('status', 'open')
        .count('* as total')
        .first()
        .then((result) => Number(result?.total ?? 0)),
      db
        .from('gateway_network_operations')
        .where('status', 'pending')
        .orderBy('created_at', 'asc')
        .select('created_at')
        .first(),
      WorkerHeartbeat.find(GATEWAY_NETWORK_OPERATIONS_WORKER),
    ])

    const oldestPendingSeconds = oldestPendingOperation
      ? Math.max(
          0,
          Math.floor(
            DateTime.now().diff(DateTime.fromJSDate(oldestPendingOperation.created_at), 'seconds')
              .seconds
          )
        )
      : null

    const workerAgeSeconds = workerHeartbeat
      ? Math.max(0, Math.floor(DateTime.now().diff(workerHeartbeat.lastSeenAt, 'seconds').seconds))
      : null

    const workerStatus =
      workerAgeSeconds !== null && workerAgeSeconds <= maxWorkerAgeSeconds ? 'ok' : 'stale'

    const status =
      workerStatus !== 'ok' ||
      expiredLeases > 0 ||
      recentHostKeyMismatches > 0 ||
      openHostKeyMismatchAlerts > 0 ||
      (oldestPendingSeconds !== null && oldestPendingSeconds > maxPendingAgeSeconds)
        ? 'degraded'
        : 'ok'

    const payload: HealthPayload = {
      status,
      queue: {
        pending,
        applying,
        failed,
        expiredLeases,
        recentHostKeyMismatches,
        openHostKeyMismatchAlerts,
        oldestPendingSeconds,
      },
      worker: {
        name: GATEWAY_NETWORK_OPERATIONS_WORKER,
        status: workerStatus,
        lastSeenAt: workerHeartbeat?.lastSeenAt.toISO() ?? null,
        ageSeconds: workerAgeSeconds,
      },
    }
    cachedHealth = { expiresAt: Date.now() + 5_000, payload }
    await sharedCache.put('health:queue', payload, 5_000)
    response.header('Cache-Control', 'private, max-age=5')
    return response.ok(payload)
  }
}
