import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'gateway_monitor_states'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.string('name').primary()
      table.uuid('lease_token').nullable()
      table.timestamp('lease_expires_at', { useTz: true }).nullable()
      table.bigInteger('cursor_id').notNullable().defaultTo(0)
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
