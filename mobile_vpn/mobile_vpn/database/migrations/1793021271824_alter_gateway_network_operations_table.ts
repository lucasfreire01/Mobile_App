import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'gateway_network_operations'

  async up() {
    this.schema.raw(`
      CREATE INDEX gateway_network_operations_pending_available_index
      ON gateway_network_operations (available_at, id)
      WHERE status = 'pending'
    `)
  }

  async down() {
    this.schema.raw(`
      DROP INDEX IF EXISTS gateway_network_operations_pending_available_index
    `)
  }
}
