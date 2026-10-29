import Gateway from '#models/gateway'
import GatewayNetworkOperation from '#models/gateway_network_operation'
import CloudConnexaService from '#services/cloud_connexa_service'
import db from '@adonisjs/lucid/services/db'
import GatewayProvisioningService, {
  MANAGEMENT_IP_LOCK,
  managementIpConflict,
  rethrowManagementIpConflict,
} from '#services/gateway_provisioning_service'
import { createGatewayValidator, updateGatewayValidator } from '#validators/gateway'
import { Exception } from '@adonisjs/core/exceptions'
import type { HttpContext } from '@adonisjs/core/http'
import { ensureAllowedSshAddress } from '#services/gateway_ssh_address_policy'

const DEFAULT_NETWORK_OPERATIONS_LIMIT = 20
const MAX_NETWORK_OPERATIONS_LIMIT = 100

function parsePaginationParameter(value: unknown, fallback: number, maximum: number) {
  const parsed = Number(value)

  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    return fallback
  }

  return Math.min(parsed, maximum)
}

export default class GatewaysController {
  /**
   * Display a list of resource
   */
  async index({ response }: HttpContext) {
    const gatewaysList = await Gateway.all()

    return response.ok({
      message: 'gateway_list',
      gatewaysList,
    })
  }

  /**
   * Display form to create a new record
   */
  async store({ request, response }: HttpContext) {
    const payload = await request.validateUsing(createGatewayValidator)
    const gateway = await new GatewayProvisioningService().create(payload)
    return response.created({ message: 'gateway created', gateway })
  }

  /**
   * Returns the .ovpn profile of the gateway's connector
   */
  async vpnProfile({ params, response }: HttpContext) {
    const gateway = await Gateway.findOrFail(params.id)

    if (!gateway.ccConnectorId) {
      throw new Exception('Gateway has no CloudConnexa connector', {
        status: 404,
        code: 'E_GATEWAY_NO_CONNECTOR',
      })
    }

    const profile = await new CloudConnexaService().getConnectorProfile(gateway.ccConnectorId)

    response.header('Content-Type', 'application/x-openvpn-profile')
    response.header('Content-Disposition', `attachment; filename="gateway-${gateway.id}.ovpn"`)
    return response.send(profile)
  }
  async show({ params, response }: HttpContext) {
    const gateway = await Gateway.findOrFail(params.id)

    return response.ok({
      gateway,
    })
  }

  async networkOperations({ params, request, response }: HttpContext) {
    const gateway = await Gateway.findOrFail(params.id)
    const page = parsePaginationParameter(request.input('page'), 1, Number.MAX_SAFE_INTEGER)
    const limit = parsePaginationParameter(
      request.input('limit'),
      DEFAULT_NETWORK_OPERATIONS_LIMIT,
      MAX_NETWORK_OPERATIONS_LIMIT
    )
    const operations = await GatewayNetworkOperation.query()
      .where('gateway_id', gateway.id)
      .orderBy('created_at', 'desc')
      .paginate(page, limit)

    operations.baseUrl(`/api/v1/gateways/${gateway.id}/network-operations`).queryString({ limit })

    return response.ok({
      operations: operations.all().map((operation) => ({
        id: operation.id,
        gatewayId: operation.gatewayId,
        action: operation.action,
        status: operation.status,
        attempts: operation.attempts,
        errorCode: operation.errorCode,
        errorMessage: operation.errorMessage,
        requestedByUserId: operation.requestedByUserId,
        requestedByEmail: operation.requestedByEmail,
        payload: operation.payload,
        previousPayload: operation.previousPayload,
        availableAt: operation.availableAt,
        startedAt: operation.startedAt,
        finishedAt: operation.finishedAt,
        createdAt: operation.createdAt,
        updatedAt: operation.updatedAt,
      })),
      meta: operations.getMeta(),
    })
  }

  async edit() {}

  /**
   * Handle form submission for the edit action
   */
  async update({ params, request, response }: HttpContext) {
    if (request.input('sshHostKeyFingerprint') !== undefined) {
      throw new Exception('Use the SSH host key rotation endpoint for this change.', {
        status: 403,
        code: 'E_GATEWAY_SSH_HOST_KEY_ROTATION_REQUIRED',
      })
    }

    const payload = await request.validateUsing(updateGatewayValidator)
    const gatewayUpdate = await db.transaction(async (trx) => {
      await trx.rawQuery("SET LOCAL lock_timeout = '5s'")
      await trx.rawQuery('SELECT pg_advisory_xact_lock(?)', [MANAGEMENT_IP_LOCK])
      const gateway = await Gateway.findOrFail(params.id, { client: trx })
      if (payload.managementIpAddress) {
        ensureAllowedSshAddress(payload.managementIpAddress)
        const normalized = await trx.rawQuery('SELECT host(?::inet) AS address', [
          payload.managementIpAddress,
        ])
        payload.managementIpAddress = normalized.rows[0].address
        const reserved = await trx
          .from('gateway_ip_reservations')
          .where('management_ip_address', payload.managementIpAddress!)
          .first()
        if (reserved) throw managementIpConflict()
      }
      gateway.merge(payload)
      try {
        await gateway.save()
      } catch (error) {
        rethrowManagementIpConflict(error)
      }
      return gateway
    })

    return response.ok({
      message: 'Gateway updated',
      gateway: gatewayUpdate,
    })
  }

  /**
   * Delete record
   */
  async destroy({ params, response }: HttpContext) {
    const gateway = await Gateway.findOrFail(params.id)

    // Remove the Network (connector + IP service) first; if it fails, keep the record
    if (gateway.ccNetworkId) {
      await new CloudConnexaService().deleteNetwork(gateway.ccNetworkId)
    }

    await gateway.delete()

    return response.noContent()
  }
}
