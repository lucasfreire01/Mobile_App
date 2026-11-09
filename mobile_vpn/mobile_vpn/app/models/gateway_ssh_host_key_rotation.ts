import { GatewaySshHostKeyRotationSchema } from '#database/schema'
import Gateway from '#models/gateway'
import User from '#models/user'
import { belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'

export default class GatewaySshHostKeyRotation extends GatewaySshHostKeyRotationSchema {
  @belongsTo(() => Gateway)
  declare gateway: BelongsTo<typeof Gateway>

  @belongsTo(() => User, { foreignKey: 'requestedByUserId' })
  declare requestedByUser: BelongsTo<typeof User>
}
