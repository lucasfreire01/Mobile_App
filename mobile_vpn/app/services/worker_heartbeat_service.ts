import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'

export const GATEWAY_NETWORK_OPERATIONS_WORKER = 'gateway_network_operations_worker'

export default class WorkerHeartbeatService {
  async beat(name: string): Promise<void> {
    const now = DateTime.now().toFormat(db.connection().dialect.dateTimeFormat)

    await db
      .table('worker_heartbeats')
      .insert({
        name,
        last_seen_at: now,
        created_at: now,
        updated_at: now,
      })
      .onConflict('name')
      .merge({
        last_seen_at: now,
        updated_at: now,
      })
  }
}
