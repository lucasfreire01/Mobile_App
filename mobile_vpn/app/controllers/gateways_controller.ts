import Gateway from '#models/gateway'
import GatewayNetworkOperation from '#models/gateway_network_operation'
import { resolveVpnProvider, gatewayVpnResources } from '#services/vpn/registry'
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
const DEFAULT_GATEWAYS_LIMIT = 20
const MAX_GATEWAYS_LIMIT = 100

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
  async index({ request, response }: HttpContext) {
    const page = parsePaginationParameter(request.input('page'), 1, Number.MAX_SAFE_INTEGER)
    const limit = parsePaginationParameter(
      request.input('limit'),
      DEFAULT_GATEWAYS_LIMIT,
      MAX_GATEWAYS_LIMIT
    )
    const search = request.input('q')
    const q = typeof search === 'string' ? search.trim().slice(0, 200) : ''
    const status = ['online', 'offline'].includes(request.input('status'))
      ? request.input('status')
      : 'all'
    const query = Gateway.query().orderBy('id', 'asc')

    if (status !== 'all') query.where('status', status)
    if (q) {
      const pattern = `%${q.replace(/[\\%_]/g, '\\$&')}%`
      query.where((searchQuery) => {
        searchQuery
          .whereILike('name', pattern)
          .orWhereILike('management_ip_address', pattern)
          .orWhereILike('wan_ip_address', pattern)
      })
    }

    const [gateways, summary] = await Promise.all([
      query.paginate(page, limit),
      db
        .from('gateways')
        .select(
          db.raw(
            "count(*)::int as total, count(*) filter (where status = 'online')::int as online, count(*) filter (where status = 'offline')::int as offline"
          )
        )
        .first(),
    ])
    gateways
      .baseUrl('/api/v1/gateways')
      .queryString({ limit, ...(q ? { q } : {}), ...(status !== 'all' ? { status } : {}) })

    return response.ok({
      message: 'gateway_list',
      gatewaysList: gateways.all(),
      meta: gateways.getMeta(),
      summary,
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

    const connectorId = gatewayVpnResources(gateway).connectorId
    if (!connectorId) {
      throw new Exception('Gateway has no VPN connector', {
        status: 404,
        code: 'E_GATEWAY_NO_CONNECTOR',
      })
    }

    const provider = await resolveVpnProvider(gateway.vpnProvider)
    const profile = await provider.getProfile(connectorId)

    const formats = {
      openvpn: { extension: 'ovpn', contentType: 'application/x-openvpn-profile' },
      wireguard: { extension: 'conf', contentType: 'text/plain' },
    }
    const format =
      profile && Object.hasOwn(formats, profile.format) ? formats[profile.format] : undefined
    if (!format || typeof profile.content !== 'string') {
      throw new Exception('VPN provider returned an unsupported profile.', {
        status: 502,
        code: 'E_VPN_PROFILE_INVALID',
      })
    }
    response.header('Content-Type', format.contentType)
    response.header(
      'Content-Disposition',
      `attachment; filename="gateway-${gateway.id}.${format.extension}"`
    )
    response.header('Cache-Control', 'no-store')
    return response.send(profile.content)
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

    // Remove remote resources first; if it fails, keep the record and its provider binding.
    const networkId = gatewayVpnResources(gateway).networkId
    if (networkId) {
      const provider = await resolveVpnProvider(gateway.vpnProvider)
      await provider.deleteGateway(networkId)
    }

    await gateway.delete()

    return response.noContent()
  }
}
