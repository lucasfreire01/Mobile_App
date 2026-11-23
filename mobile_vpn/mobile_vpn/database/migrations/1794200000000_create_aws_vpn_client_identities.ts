import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.createTable('aws_vpn_client_identities', (table) => {
      table.string('connector_id', 128).primary()
      table.string('certificate_arn', 512).nullable().unique()
      table.string('certificate_serial', 80).nullable()
      table.text('encrypted_identity').notNullable()
      table.string('status', 32).notNullable()
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(this.now())
      table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(this.now())
      table.index(['status', 'updated_at'])
    })
  }

  async down() {
    this.schema.dropTable('aws_vpn_client_identities')
  }
}
