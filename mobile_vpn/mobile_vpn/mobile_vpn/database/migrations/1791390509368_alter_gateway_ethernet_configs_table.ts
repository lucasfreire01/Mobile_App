import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'gateway_ethernet_configs'
  async up() {
    this.schema.renameTable('gateway_confs', 'gateway_ethernet_configs')
  }

  async down() {
    this.schema.renameTable('gateway_ethernet_configs', 'gateway_confs')
  }
}
