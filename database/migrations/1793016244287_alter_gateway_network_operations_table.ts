import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'gateway_network_operations'

  async up() {
    this.schema.raw(`
      CREATE UNIQUE INDEX gateway_network_operations_one_active_per_gateway
      ON gateway_network_operations (gateway_id)
      WHERE status IN ('pending', 'applying')
    `)
  }

  async down() {
    this.schema.raw(`
      DROP INDEX IF EXISTS gateway_network_operations_one_active_per_gateway
    `)
  }
}
