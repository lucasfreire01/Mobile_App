import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'gateways'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.string('name').nullable()
      table.string('gateway_eui').nullable().unique()
      table.string('ip_address').nullable()
      table.string('location').nullable()
      table.string('status').notNullable().defaultTo('offline')
      table.timestamp('last_seen_at').nullable()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumns('name', 'gateway_eui', 'ip_address', 'location', 'status', 'last_seen_at')
    })
  }
}
