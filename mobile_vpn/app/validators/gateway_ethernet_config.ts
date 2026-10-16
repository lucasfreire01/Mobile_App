import vine from '@vinejs/vine'

export const updateGatewayEthernetConfValidator = vine.create({
  mode: vine.enum(['dhcp'] as const),
})
