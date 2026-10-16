import { GatewaySchema } from '#database/schema'
import { hasOne } from '@adonisjs/lucid/orm'
import GatewayEthernetConfig from './gateway_ethernet_config.ts'
import type { HasOne } from '@adonisjs/lucid/types/relations'

export default class Gateway extends GatewaySchema {
  @hasOne(() => GatewayEthernetConfig)
  declare ethernetConfig: HasOne<typeof GatewayEthernetConfig>
}
