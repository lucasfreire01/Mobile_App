import vine from '@vinejs/vine'

const ethernetConfigSchema = vine
  .object({
    mode: vine.enum(['dhcp', 'static'] as const),
    dhcpFallbackEnabled: vine.boolean().optional(),
    secondaryDns: vine.string().ipAddress().optional(),
  })
  .merge(
    vine.group([
      vine.group.if((value) => value.mode === 'static' || value.dhcpFallbackEnabled === true, {
        staticIpAddress: vine.string().ipAddress(),
        staticPrefixLength: vine.number().min(1).max(32),
        staticGateway: vine.string().ipAddress(),
        primaryDns: vine.string().ipAddress(),
      }),
      vine.group.else({
        staticIpAddress: vine.string().ipAddress().optional(),
        staticPrefixLength: vine.number().min(1).max(32).optional(),
        staticGateway: vine.string().ipAddress().optional(),
        primaryDns: vine.string().ipAddress().optional(),
      }),
    ])
  )

export const updateGatewayEthernetConfValidator = vine.create(ethernetConfigSchema)
