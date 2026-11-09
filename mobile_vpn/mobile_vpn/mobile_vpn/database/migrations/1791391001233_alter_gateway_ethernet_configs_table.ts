import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'gateway_ethernet_configs'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table
        .integer('gateway_id')
        .unsigned()
        .notNullable()
        .unique()
        .references('id')
        .inTable('gateways')
        .onDelete('CASCADE')

      table.string('mode').notNullable().defaultTo('dhcp')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumns('gateway_id', 'mode')
    })
  }
}
