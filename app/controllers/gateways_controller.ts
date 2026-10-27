import Gateway from '#models/gateway'
import GatewayNetworkOperation from '#models/gateway_network_operation'
import CloudConnexaService from '#services/cloud_connexa_service'
import GatewayService from '#services/gateway_service'
import { createGatewayValidator, updateGatewayValidator } from '#validators/gateway'
import { Exception } from '@adonisjs/core/exceptions'
import type { HttpContext } from '@adonisjs/core/http'

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
    const gatewayService = new GatewayService()
    const cloudConnexa = new CloudConnexaService()

    // Use the IP sent by the client or allocate the next free one
    const managementIpAddress =
      payload.managementIpAddress ?? (await gatewayService.allocateManagementIp())
    await gatewayService.ensureManagementIpIsFree(managementIpAddress)

    // Network + Connector + IP Service (/32) on CloudConnexa
    const vpn = await cloudConnexa.createGatewayResources(
      gatewayService.toNetworkName(payload.name),
      managementIpAddress
    )

    try {
      const gateway = await Gateway.create({
        ...payload,
        managementIpAddress,
        ccNetworkId: vpn.networkId,
        ccConnectorId: vpn.connectorId,
        ccIpServiceId: vpn.ipServiceId,
      })

      return response.created({ message: 'gateway created', gateway })
    } catch (err) {
      // Do not leave an orphan Network on CloudConnexa
      await cloudConnexa.deleteNetwork(vpn.networkId).catch(() => {})
      throw err
    }
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

    operations
      .baseUrl(`/api/v1/gateways/${gateway.id}/network-operations`)
      .queryString({ limit })

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

    const gatewayUpdate = await Gateway.findOrFail(params.id)
    const payload = await request.validateUsing(updateGatewayValidator)

    gatewayUpdate.merge(payload)
    await gatewayUpdate.save()

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
