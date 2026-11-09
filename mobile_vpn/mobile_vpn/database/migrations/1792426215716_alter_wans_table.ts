import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'gateways'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.renameColumn('lan_ip_address', 'wan_ip_address')
      table.renameColumn('lan_ip_observed_at', 'wan_ip_observed_at')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.renameColumn('wan_ip_address', 'lan_ip_address')
      table.renameColumn('wan_ip_observed_at', 'lan_ip_observed_at')
    })
  }
}
