import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'gateway_network_operations'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.jsonb('payload').nullable()
      table.timestamp('available_at', { useTz: true }).nullable().index()
      table.uuid('processing_token').nullable()
      table.timestamp('processing_expires_at', { useTz: true }).nullable()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('processing_expires_at')
      table.dropColumn('processing_token')
      table.dropColumn('available_at')
      table.dropColumn('payload')
    })
  }
}
