import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.createTable('saganexus_shared_cache', (table) => {
      table.string('key', 255).primary()
      table.text('payload').notNullable()
      table.timestamp('expires_at').notNullable().index()
      table.timestamp('updated_at').notNullable().defaultTo(this.now())
    })
  }

  async down() {
    this.schema.dropTable('saganexus_shared_cache')
  }
}
