import { randomUUID } from 'node:crypto'
import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'

export const GATEWAY_MONITOR_NAME = 'gateway-status'

export type MonitorLease = { token: string; cursor: number }

/** Shared by replicas using the same database. Never hold a transaction during SSH. */
export default class GatewayMonitorLeaseService {
  private async transaction<T>(work: (trx: TransactionClientContract) => Promise<T>) {
    return db.transaction(async (trx) => {
      await trx.rawQuery("SET LOCAL lock_timeout = '5s'")
      await trx.rawQuery("SET LOCAL statement_timeout = '5s'")
      return work(trx)
    })
  }

  async acquire(durationMs: number): Promise<MonitorLease | null> {
    if (!Number.isInteger(durationMs) || durationMs < 1 || durationMs > 140_000) {
      throw new Error('Invalid gateway monitor lease duration.')
    }
    const token = randomUUID()
    return this.transaction(async (trx) => {
      const result = await trx.rawQuery(
        `INSERT INTO gateway_monitor_states (name, lease_token, lease_expires_at, cursor_id)
         VALUES (?, ?, clock_timestamp() + ? * interval '1 millisecond', 0)
         ON CONFLICT (name) DO UPDATE
         SET lease_token = EXCLUDED.lease_token, lease_expires_at = EXCLUDED.lease_expires_at
         WHERE gateway_monitor_states.lease_token IS NULL
            OR gateway_monitor_states.lease_expires_at <= clock_timestamp()
         RETURNING cursor_id`,
        [GATEWAY_MONITOR_NAME, token, durationMs]
      )
      return result.rows.length ? { token, cursor: Number(result.rows[0].cursor_id) } : null
    })
  }

  private async owned(
    lease: MonitorLease,
    work: (trx: TransactionClientContract) => Promise<void>
  ): Promise<boolean> {
    return this.transaction(async (trx) => {
      // Lock the ownership row until publication commits so takeover cannot race a stale write.
      const state = await trx
        .from('gateway_monitor_states')
        .where('name', GATEWAY_MONITOR_NAME)
        .where('lease_token', lease.token)
        .forUpdate()
        .first()
      if (!state) return false
      // Evaluate database time after acquiring the row lock, including any lock wait.
      const valid = await trx
        .from('gateway_monitor_states')
        .where('name', GATEWAY_MONITOR_NAME)
        .whereRaw('lease_expires_at > clock_timestamp()')
        .first()
      if (!valid) return false
      await work(trx)
      return true
    })
  }

  async advanceCursor(lease: MonitorLease, cursor: number) {
    return this.owned(lease, async (trx) => {
      await trx
        .from('gateway_monitor_states')
        .where('name', GATEWAY_MONITOR_NAME)
        .update({
          cursor_id: trx.raw('GREATEST(cursor_id, ?)', [cursor]),
        })
    })
  }

  async resetCursor(lease: MonitorLease) {
    return this.owned(lease, async (trx) => {
      await trx
        .from('gateway_monitor_states')
        .where('name', GATEWAY_MONITOR_NAME)
        .update({ cursor_id: 0 })
    })
  }

  async publish(
    lease: MonitorLease,
    gateway: { id: number; managementIpAddress: string | null },
    update: Record<string, string | Date>
  ) {
    return this.owned(lease, async (trx) => {
      await trx
        .from('gateways')
        .where('id', gateway.id)
        .where('management_ip_address', gateway.managementIpAddress!)
        .update(update)
    })
  }

  async release(lease: MonitorLease) {
    await this.transaction(async (trx) => {
      await trx
        .from('gateway_monitor_states')
        .where('name', GATEWAY_MONITOR_NAME)
        .where('lease_token', lease.token)
        .update({ lease_token: null, lease_expires_at: null })
    })
  }
}
