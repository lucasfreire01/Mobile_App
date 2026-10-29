import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'gateway_security_alerts'

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
        .integer('operation_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('gateway_network_operations')
        .onDelete('CASCADE')
        .unique()
      table.string('type', 100).notNullable()
      table.string('status', 20).notNullable().defaultTo('open')
      table.text('message').notNullable()
      table
        .integer('acknowledged_by_user_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('users')
        .onDelete('SET NULL')
      table.string('acknowledged_by_email', 255).nullable()
      table.timestamp('acknowledged_at', { useTz: true }).nullable()
      table.timestamp('created_at', { useTz: true }).notNullable()
      table.timestamp('updated_at', { useTz: true }).notNullable()

      table.index(['gateway_id', 'status', 'created_at'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
