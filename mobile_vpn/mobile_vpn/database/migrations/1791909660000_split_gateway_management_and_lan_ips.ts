import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'gateways'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.renameColumn('ip_address', 'management_ip_address')
      table.string('lan_ip_address').nullable()
      table.timestamp('lan_ip_observed_at').nullable()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumns('lan_ip_address', 'lan_ip_observed_at')
      table.renameColumn('management_ip_address', 'ip_address')
    })
  }
}
