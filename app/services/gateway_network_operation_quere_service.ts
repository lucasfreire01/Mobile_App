import GatewayNetworkOperation from '#models/gateway_network_operation'
import db from '@adonisjs/lucid/services/db'
import { randomUUID } from 'node:crypto'
import { DateTime } from 'luxon'
export const MAX_ATTEMPTS = 5
export const BACKOFF_BASE_SECONDS = 30 // seconds per attempt

type ClaimedOperation = {
  operation: GatewayNetworkOperation
  processingToken: string
}

const PROCESSING_DURATION_MINUTES = 5

export default class GatewayNetworkOperationQueueService {
  async claimNext(): Promise<ClaimedOperation | null> {
    const processingToken = randomUUID()
    const now = DateTime.now()
    const processingExpiresAt = now.plus({
      minutes: PROCESSING_DURATION_MINUTES,
    })

    return db.transaction(async (trx) => {
      await trx
        .from('gateway_network_operations')
        .where('status', 'applying')
        .where('processing_expires_at', '<=', now.toJSDate())
        .where('attempts', '<', MAX_ATTEMPTS)
        .update({
          status: 'pending',
          available_at: now.toJSDate(),
          processing_token: null,
          processing_expires_at: null,
          error_code: 'E_GATEWAY_OPERATION_LEASE_EXPIRED',
          error_message: 'Worker lease expired before the operation finished.',
        })

      await trx
        .from('gateway_network_operations')
        .where('status', 'applying')
        .where('processing_expires_at', '<=', now.toJSDate())
        .where('attempts', '>=', MAX_ATTEMPTS)
        .update({
          status: 'failed',
          finished_at: now.toJSDate(),
          processing_token: null,
          processing_expires_at: null,
          error_code: 'E_GATEWAY_OPERATION_LEASE_EXPIRED',
          error_message: 'Worker lease expired after the maximum number of attempts.',
        })

      const operation = await GatewayNetworkOperation.query({ client: trx })
        .where('status', 'pending')
        .where('available_at', '<=', now.toJSDate())
        .orderBy('available_at', 'asc')
        .orderBy('id', 'asc')
        .forUpdate()
        .skipLocked()
        .first()

      if (!operation) {
        return null
      }

      operation.useTransaction(trx)
      operation.status = 'applying'
      operation.attempts += 1
      operation.startedAt = now
      operation.processingToken = processingToken
      operation.processingExpiresAt = processingExpiresAt
      await operation.save()

      return {
        operation,
        processingToken,
      }
    })
  }
}
