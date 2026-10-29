import { GatewayNetworkOperationSchema } from '#database/schema'
import Gateway from '#models/gateway'
import { belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'

export default class GatewayNetworkOperation extends GatewayNetworkOperationSchema {
  @belongsTo(() => Gateway)
  declare gateway: BelongsTo<typeof Gateway>
}
