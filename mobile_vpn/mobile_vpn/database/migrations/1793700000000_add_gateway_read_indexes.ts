import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('gateways', (table) => {
      table.index(['status', 'id'], 'gateways_status_id_index')
    })

    this.schema.alterTable('gateway_network_operations', (table) => {
      table.index(['status', 'available_at'], 'gateway_operations_status_available_index')
      table.index(['gateway_id', 'created_at'], 'gateway_operations_gateway_created_index')
    })

    this.schema.alterTable('gateway_security_alerts', (table) => {
      table.index(['gateway_id', 'status', 'created_at'], 'gateway_alerts_gateway_status_created_index')
    })

    this.schema.alterTable('gateway_ssh_host_key_rotations', (table) => {
      table.index(['gateway_id', 'created_at'], 'gateway_rotations_gateway_created_index')
    })
  }

  async down() {
    this.schema.alterTable('gateways', (table) => table.dropIndex(['status', 'id'], 'gateways_status_id_index'))
    this.schema.alterTable('gateway_network_operations', (table) => {
      table.dropIndex(['status', 'available_at'], 'gateway_operations_status_available_index')
      table.dropIndex(['gateway_id', 'created_at'], 'gateway_operations_gateway_created_index')
    })
    this.schema.alterTable('gateway_security_alerts', (table) =>
      table.dropIndex(['gateway_id', 'status', 'created_at'], 'gateway_alerts_gateway_status_created_index')
    )
    this.schema.alterTable('gateway_ssh_host_key_rotations', (table) =>
      table.dropIndex(['gateway_id', 'created_at'], 'gateway_rotations_gateway_created_index')
    )
  }
}
