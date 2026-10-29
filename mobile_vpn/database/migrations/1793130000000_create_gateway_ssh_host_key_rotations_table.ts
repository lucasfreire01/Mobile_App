import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'gateway_ssh_host_key_rotations'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      table
        .integer('gateway_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('gateways')
        .onDelete('CASCADE')
      table
        .integer('requested_by_user_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('users')
        .onDelete('SET NULL')
      table.string('requested_by_email', 255).notNullable()
      table.string('previous_fingerprint', 64).nullable()
      table.string('next_fingerprint', 64).notNullable()
      table.string('reason', 500).notNullable()
      table.timestamp('created_at', { useTz: true }).notNullable()

      table.index(['gateway_id', 'created_at'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
