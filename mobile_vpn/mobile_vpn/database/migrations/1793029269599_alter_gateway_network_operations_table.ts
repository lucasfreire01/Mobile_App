import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'gateway_network_operations'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table
        .integer('requested_by_user_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('users')
        .onDelete('SET NULL')

      table.string('requested_by_email', 255).nullable()
      table.jsonb('previous_payload').nullable()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropForeign(['requested_by_user_id'])
      table.dropColumn('requested_by_user_id')
      table.dropColumn('requested_by_email')
      table.dropColumn('previous_payload')
    })
  }
}
