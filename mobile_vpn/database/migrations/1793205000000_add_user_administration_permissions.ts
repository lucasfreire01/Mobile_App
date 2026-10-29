import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('users', (table) => {
      // Public signup previously granted gateway access to every account.
      // Existing accounts must be explicitly approved by a trusted operator.
      table.boolean('is_admin').notNullable().defaultTo(false)
    })
    this.defer(async (db) => {
      // Expire legacy tokens that were issued without an expiration date.
      await db.from('auth_access_tokens').whereNull('expires_at').update({ expires_at: new Date() })
    })
  }

  async down() {
    this.schema.alterTable('users', (table) => table.dropColumn('is_admin'))
  }
}
