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
    const token = randomUUID()
    const expiresAt = DateTime.now().plus({
      minutes: LOCK_DURATION_MINUTES,
    })

    const updatedGateways = await db
      .from('gateways')
      .where('id', gatewayId)
      .where((query) => {
        query
          .whereNull('network_lock_expires_at')
          .orWhere('network_lock_expires_at', '<=', DateTime.now().toJSDate())
      })
      .update({
        network_lock_token: token,
        network_lock_expires_at: expiresAt.toJSDate(),
      })
      .returning('id')

    if (updatedGateways.length !== 1) {
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
