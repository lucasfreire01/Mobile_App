import db from '@adonisjs/lucid/services/db'
import { Exception } from '@adonisjs/core/exceptions'

export default class GatewayAdvisoryLockService {
  async run<T>(gatewayId: number, work: () => Promise<T>): Promise<T> {
    return db.transaction(async (trx) => {
      try {
        await trx.rawQuery("SET LOCAL lock_timeout = '2s'")
        await trx.rawQuery('SELECT pg_advisory_xact_lock(hashtext(?))', [`saganexus:gateway:${gatewayId}`])
      } catch {
        throw new Exception('Gateway operation is busy; retry shortly.', { status: 409, code: 'E_GATEWAY_OPERATION_BUSY' })
      }
      return work()
    })
  }
}
