import Gateway from '#models/gateway'
import GatewaySshHostKeyRotation from '#models/gateway_ssh_host_key_rotation'
import { rotateGatewaySshHostKeyValidator } from '#validators/gateway'
import { Exception } from '@adonisjs/core/exceptions'
import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'

const DEFAULT_ROTATIONS_LIMIT = 20
const MAX_ROTATIONS_LIMIT = 100

function parsePaginationParameter(value: unknown, fallback: number, maximum: number) {
  const parsed = Number(value)

  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    return fallback
  }

  return Math.min(parsed, maximum)
}

export default class GatewaySshHostKeysController {
  async index({ params, request, response }: HttpContext) {
    const gateway = await Gateway.findOrFail(params.id)
    const page = parsePaginationParameter(request.input('page'), 1, Number.MAX_SAFE_INTEGER)
    const limit = parsePaginationParameter(
      request.input('limit'),
      DEFAULT_ROTATIONS_LIMIT,
      MAX_ROTATIONS_LIMIT
    )
    const rotations = await GatewaySshHostKeyRotation.query()
      .where('gateway_id', gateway.id)
      .orderBy('created_at', 'desc')
      .paginate(page, limit)

    rotations
      .baseUrl(`/api/v1/gateways/${gateway.id}/ssh-host-key/rotations`)
      .queryString({ limit })

    return response.ok({
      rotations: rotations.all(),
      meta: rotations.getMeta(),
    })
  }

  async rotate({ auth, params, request, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const payload = await request.validateUsing(rotateGatewaySshHostKeyValidator)

    const rotation = await db.transaction(async (trx) => {
      const gateway = await Gateway.query({ client: trx }).where('id', params.id).forUpdate().firstOrFail()

      if (gateway.sshHostKeyFingerprint === payload.sshHostKeyFingerprint) {
        throw new Exception('Gateway already uses this SSH host key fingerprint.', {
          status: 409,
          code: 'E_GATEWAY_SSH_HOST_KEY_UNCHANGED',
        })
      }

      const rotation = new GatewaySshHostKeyRotation()
      rotation.useTransaction(trx)
      rotation.fill({
        gatewayId: gateway.id,
        requestedByUserId: user.id,
        requestedByEmail: user.email,
        previousFingerprint: gateway.sshHostKeyFingerprint,
        nextFingerprint: payload.sshHostKeyFingerprint,
        reason: payload.reason,
      })

      gateway.sshHostKeyFingerprint = payload.sshHostKeyFingerprint
      await gateway.save()
      await rotation.save()

      return rotation
    })

    return response.ok({
      message: 'Gateway SSH host key fingerprint rotated.',
      rotation,
    })
  }
}
