import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'gateways'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.string('cc_network_id').nullable()
      table.string('cc_connector_id').nullable()
      table.string('cc_ip_service_id').nullable()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumns('cc_network_id', 'cc_connector_id', 'cc_ip_service_id')
    })
  }
}
