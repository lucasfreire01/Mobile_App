import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'gateway_ethernet_configs'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.string('static_ip_address').nullable()
      table.integer('static_prefix_length').nullable()
      table.string('static_gateway').nullable()
      table.string('primary_dns').nullable()
      table.string('secondary_dns').nullable()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumns(
        'static_ip_address',
        'static_prefix_length',
        'static_gateway',
        'primary_dns',
        'secondary_dns'
      )
    })
  }
}
