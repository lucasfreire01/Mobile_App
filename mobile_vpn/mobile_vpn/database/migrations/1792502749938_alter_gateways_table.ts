import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'gateways'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.uuid('network_lock_token').nullable()
      table.timestamp('network_lock_expires_at', { useTz: true }).nullable()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('network_lock_token')
      table.dropColumn('network_lock_expires_at')
    })
  }
}
