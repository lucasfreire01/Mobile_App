import { GatewayEthernetConfigSchema } from '#database/schema'
import Gateway from '#models/gateway'
import { belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'

export default class GatewayEthernetConfig extends GatewayEthernetConfigSchema {
  @belongsTo(() => Gateway)
  declare gateway: BelongsTo<typeof Gateway>
}
