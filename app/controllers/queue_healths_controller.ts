import db from '@adonisjs/lucid/services/db'
import type { HttpContext } from '@adonisjs/core/http'
import { DateTime } from 'luxon'
import env from '#start/env'
import WorkerHeartbeat from '#models/worker_heartbeat'
import { GATEWAY_NETWORK_OPERATIONS_WORKER } from '#services/worker_heartbeat_service'

export default class QueueHealthsController {
  async show({ response }: HttpContext) {
    const maxPendingAgeSeconds = env.get('QUEUE_HEALTH_MAX_PENDING_AGE_SECONDS', 300)
    const maxWorkerAgeSeconds = env.get('QUEUE_HEALTH_MAX_WORKER_AGE_SECONDS', 60)

    const countByStatus = async (status: string) => {
      const result = await db
        .from('gateway_network_operations')
        .where('status', status)
        .count('* as total')
        .first()

      return Number(result?.total ?? 0)
    }

    const [pending, applying, failed, expiredLeases, oldestPendingOperation, workerHeartbeat] =
      await Promise.all([
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
            DateTime.now()
              .diff(DateTime.fromJSDate(oldestPendingOperation.created_at), 'seconds')
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
      (oldestPendingSeconds !== null && oldestPendingSeconds > maxPendingAgeSeconds)
        ? 'degraded'
        : 'ok'

    return response.ok({
      status,
      queue: {
        pending,
        applying,
        failed,
        expiredLeases,
        oldestPendingSeconds,
      },
      worker: {
        name: GATEWAY_NETWORK_OPERATIONS_WORKER,
        status: workerStatus,
        lastSeenAt: workerHeartbeat?.lastSeenAt.toISO() ?? null,
        ageSeconds: workerAgeSeconds,
      },
    })
  }
}
