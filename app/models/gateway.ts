import { GatewaySchema } from '#database/schema'
import { column, hasMany, hasOne } from '@adonisjs/lucid/orm'
import type { HasMany, HasOne } from '@adonisjs/lucid/types/relations'
import { DateTime } from 'luxon'
import GatewayEthernetConfig from './gateway_ethernet_config.ts'
import GatewayNetworkOperation from '#models/gateway_network_operation'

export default class Gateway extends GatewaySchema {
  @column({ serializeAs: null })
  declare networkLockToken: string | null

  @column.dateTime({ serializeAs: null })
  declare networkLockExpiresAt: DateTime | null

  @hasOne(() => GatewayEthernetConfig)
  declare ethernetConfig: HasOne<typeof GatewayEthernetConfig>
  @hasMany(() => GatewayNetworkOperation)
  declare networkOperations: HasMany<typeof GatewayNetworkOperation>
}
