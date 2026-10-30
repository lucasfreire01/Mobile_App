import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('gateways', (table) => {
      table.string('vpn_provider', 64).notNullable().defaultTo('cloudconnexa')
      table.jsonb('vpn_resources').nullable()
    })
    this.schema.alterTable('gateway_ip_reservations', (table) => {
      table.string('vpn_provider', 64).notNullable().defaultTo('cloudconnexa')
    })
  }

  async down() {
    this.schema.alterTable('gateway_ip_reservations', (table) => table.dropColumn('vpn_provider'))
    this.schema.alterTable('gateways', (table) => {
      table.dropColumn('vpn_provider')
      table.dropColumn('vpn_resources')
    })
  }
}
