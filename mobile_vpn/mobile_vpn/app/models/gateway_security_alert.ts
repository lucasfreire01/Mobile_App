import { GatewaySecurityAlertSchema } from '#database/schema'
import Gateway from '#models/gateway'
import GatewayNetworkOperation from '#models/gateway_network_operation'
import User from '#models/user'
import { belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'

export default class GatewaySecurityAlert extends GatewaySecurityAlertSchema {
  @belongsTo(() => Gateway)
  declare gateway: BelongsTo<typeof Gateway>

  @belongsTo(() => GatewayNetworkOperation)
  declare operation: BelongsTo<typeof GatewayNetworkOperation>

  @belongsTo(() => User, { foreignKey: 'acknowledgedByUserId' })
  declare acknowledgedByUser: BelongsTo<typeof User>
}
