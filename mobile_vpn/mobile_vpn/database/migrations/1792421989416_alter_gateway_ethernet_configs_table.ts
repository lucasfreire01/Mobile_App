import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'gateway_ethernet_configs'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.boolean('dhcp_fallback_enabled').notNullable().defaultTo(false)
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('dhcp_fallback_enabled')
    })
  }
}
