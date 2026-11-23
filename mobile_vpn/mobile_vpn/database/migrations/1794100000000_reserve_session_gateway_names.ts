import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.raw(`
      ALTER TABLE gateway_ip_reservations
        ALTER COLUMN management_ip_address DROP NOT NULL,
        ADD COLUMN gateway_name_key text UNIQUE,
        ADD CONSTRAINT gateway_reservation_has_ip_or_name
          CHECK (management_ip_address IS NOT NULL OR gateway_name_key IS NOT NULL)
    `)
  }

  async down() {
    this.schema.raw(`
      ALTER TABLE gateway_ip_reservations
        ALTER COLUMN management_ip_address SET NOT NULL,
        DROP CONSTRAINT gateway_reservation_has_ip_or_name,
        DROP COLUMN gateway_name_key
    `)
  }
}
