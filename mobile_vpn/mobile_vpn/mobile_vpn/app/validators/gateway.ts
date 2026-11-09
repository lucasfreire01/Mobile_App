import vine from '@vinejs/vine'

export const createGatewayValidator = vine.create({
  name: vine.string().trim().minLength(1).maxLength(100),
  gatewayEui: vine
    .string()
    .trim()
    .regex(/^[0-9a-fA-F]{16}$/)
    .optional(),
  ipAddress: vine.string().ipAddress().optional(),
  location: vine.string().trim().minLength(1).maxLength(255).optional(),
})
