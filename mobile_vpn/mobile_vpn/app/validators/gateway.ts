import vine from '@vinejs/vine'

export const createGatewayValidator = vine.create({
  name: vine.string().trim().minLength(1).maxLength(100),
  gatewayEui: vine
    .string()
    .trim()
    .regex(/^[0-9a-fA-F]{16}$/)
    .optional(),
  managementIpAddress: vine.string().ipAddress().optional(),
  location: vine.string().trim().minLength(1).maxLength(255).optional(),
  sshHostKeyFingerprint: vine
    .string()
    .trim()
    .regex(/^SHA256:[A-Za-z0-9+/]+={0,2}$/)
    .optional(),
})

export const updateGatewayValidator = vine.create({
  name: vine.string().trim().minLength(1).maxLength(100),
  gatewayEui: vine
    .string()
    .trim()
    .regex(/^[0-9a-fA-F]{16}$/)
    .optional(),
  managementIpAddress: vine.string().ipAddress().optional(),
  location: vine.string().trim().minLength(1).maxLength(255).optional(),
})

export const rotateGatewaySshHostKeyValidator = vine.create({
  sshHostKeyFingerprint: vine
    .string()
    .trim()
    .regex(/^SHA256:[A-Za-z0-9+/]+={0,2}$/),
  reason: vine.string().trim().minLength(3).maxLength(500),
})

export const gatewayEnrollmentCodeValidator = vine.create({
  code: vine.string().regex(/^[A-Za-z0-9_-]{43}$/),
})

export const completeGatewayEnrollmentValidator = vine.create({
  code: vine.string().regex(/^[A-Za-z0-9_-]{43}$/),
  sshHostKeyFingerprint: vine.string().regex(/^SHA256:[A-Za-z0-9+/]{43}$/),
})
