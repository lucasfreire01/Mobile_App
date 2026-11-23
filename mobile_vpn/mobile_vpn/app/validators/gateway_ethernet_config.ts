import vine from '@vinejs/vine'

const ethernetConfigSchema = vine
  .object({
    mode: vine.enum(['dhcp', 'static'] as const),
    dhcpFallbackEnabled: vine.boolean().optional(),
    secondaryDns: vine.string().ipAddress().nullable().optional(),
  })
  .merge(
    vine.group([
      vine.group.if((value) => value.mode === 'static' || value.dhcpFallbackEnabled === true, {
        staticIpAddress: vine.string().ipAddress(4),
        staticPrefixLength: vine.number().min(1).max(32).withoutDecimals(),
        staticGateway: vine.string().ipAddress(4),
        primaryDns: vine.string().ipAddress(),
      }),
      vine.group.else({
        staticIpAddress: vine.string().ipAddress(4).optional(),
        staticPrefixLength: vine.number().min(1).max(32).withoutDecimals().optional(),
        staticGateway: vine.string().ipAddress(4).optional(),
        primaryDns: vine.string().ipAddress().optional(),
      }),
    ])
  )

export const updateGatewayEthernetConfValidator = vine.create(ethernetConfigSchema)
