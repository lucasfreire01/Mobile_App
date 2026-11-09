import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'gateway_confs'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      table
        .integer('gateway_id')
        .unsigned()
        .notNullable()
        .unique()
        .references('id')
        .inTable('gateways')
        .onDelete('CASCADE')
      table.string('mode').notNullable().defaultTo('dhcp')

      table.timestamp('created_at')
      table.timestamp('updated_at')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
