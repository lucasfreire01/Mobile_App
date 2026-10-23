import db from '@adonisjs/lucid/services/db'
import type { HttpContext } from '@adonisjs/core/http'
import { DateTime } from 'luxon'
import env from '#start/env'

export default class QueueHealthsController {
  async show({ response }: HttpContext) {
    const maxPendingAgeSeconds = env.get('QUEUE_HEALTH_MAX_PENDING_AGE_SECONDS', 300)

    const countByStatus = async (status: string) => {
      const result = await db
        .from('gateway_network_operations')
        .where('status', status)
        .count('* as total')
        .first()

      return Number(result?.total ?? 0)
    }

    const [pending, applying, failed, expiredLeases, oldestPendingOperation] = await Promise.all([
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

    const status =
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
    })
  }
}
