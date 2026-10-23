import db from '@adonisjs/lucid/services/db'
import { Exception } from '@adonisjs/core/exceptions'
import { DateTime } from 'luxon'
import { randomUUID } from 'node:crypto'

type GatewayLock = {
  token: string
  expiresAt: DateTime
}

const LOCK_DURATION_MINUTES = 2

export default class GatewayLockService {
  async acquire(gatewayId: number): Promise<GatewayLock> {
    const gateway = await db.from('gateways').where('id', gatewayId).select('id').first()

    if (!gateway) {
      throw new Exception('Gateway not found.', {
        status: 404,
        code: 'E_GATEWAY_NOT_FOUND',
      })
    }

    const token = randomUUID()
    const now = DateTime.now()
    const expiresAt = DateTime.now().plus({
      minutes: LOCK_DURATION_MINUTES,
    })
    const connection = db.connection()
    const nowValue = now.toFormat(connection.dialect.dateTimeFormat)
    const expiresAtValue = expiresAt.toFormat(connection.dialect.dateTimeFormat)

    await db
      .from('gateways')
      .where('id', gatewayId)
      .where((query) => {
        query
          .whereNull('network_lock_expires_at')
          .orWhere('network_lock_expires_at', '<=', nowValue)
      })
      .update({
        network_lock_token: token,
        network_lock_expires_at: expiresAtValue,
      })

    const acquiredGateway = await db
      .from('gateways')
      .where('id', gatewayId)
      .where('network_lock_token', token)
      .select('id')
      .first()

    if (!acquiredGateway) {
      throw new Exception('Gateway already has a network change in progress.', {
        status: 409,
        code: 'E_GATEWAY_NETWORK_LOCKED',
      })
    }

    return { token, expiresAt }
  }
  async release(gatewayId: number, token: string): Promise<void> {
    await db.from('gateways').where('id', gatewayId).where('network_lock_token', token).update({
      network_lock_token: null,
      network_lock_expires_at: null,
    })
  }
}
