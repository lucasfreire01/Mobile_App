import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.createTable('vpn_account_migrations', (table) => {
      table.increments('id')
      table.string('provider', 64).notNullable()
      table.string('account_identity', 64).notNullable()
      table.string('previous_account_identity', 64).nullable()
      table.string('status', 32).notNullable()
      table.jsonb('gateway_snapshots').nullable()
      table.text('error_code').nullable()
      table.text('error_message').nullable()
      table.timestamp('started_at', { useTz: true }).notNullable()
      table.timestamp('completed_at', { useTz: true }).nullable()
      table.timestamp('created_at', { useTz: true }).notNullable()
      table.timestamp('updated_at', { useTz: true }).notNullable()
      table.index(['provider', 'account_identity'])
      table.index(['provider', 'status'])
    })
  }

  async down() {
    this.schema.dropTable('vpn_account_migrations')
  }
}
