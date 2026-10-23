import db from '@adonisjs/lucid/services/db'
import type { HttpContext } from '@adonisjs/core/http'

export default class HealthController {
  async show({ response }: HttpContext) {
    try {
      await db.rawQuery('SELECT 1')

      return response.ok({
        status: 'ok',
        database: 'ok',
      })
    } catch {
      return response.serviceUnavailable({
        status: 'unavailable',
        database: 'unavailable',
      })
    }
  }
}
