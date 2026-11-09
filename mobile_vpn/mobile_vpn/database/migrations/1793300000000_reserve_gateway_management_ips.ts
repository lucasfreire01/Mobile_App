import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    // inet equality also prevents equivalent IPv6 spellings from being duplicated.
    this.schema.raw(
      'CREATE UNIQUE INDEX gateways_management_ip_address_unique ON gateways ((management_ip_address::inet))'
    )
    this.schema.createTable('gateway_ip_reservations', (table) => {
      table.increments('id')
      table.specificType('management_ip_address', 'inet').notNullable().unique()
      table.uuid('token').notNullable().unique()
      table.string('network_id').nullable()
      table.string('status').notNullable().defaultTo('provisioning')
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(this.now())
      table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(this.now())
    })
  }

  async down() {
    this.schema.dropTable('gateway_ip_reservations')
    this.schema.raw('DROP INDEX gateways_management_ip_address_unique')
  }
}
