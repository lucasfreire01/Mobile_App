import Gateway from '#models/gateway'
import GatewayNetworkOperation from '#models/gateway_network_operation'
import {
  gatewayVpnResources,
  requireManagedVpnProvider,
  requireVpnProfile,
  resolveVpnProvider,
} from '#services/vpn/registry'
import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import GatewayProvisioningService, {
  MANAGEMENT_IP_LOCK,
  assertGatewayNameAvailable,
  gatewayPairingKey,
  lockGatewayForPairing,
  managementIpConflict,
  rethrowManagementIpConflict,
  saveGatewayPairing,
} from '#services/gateway_provisioning_service'
import {
  createGatewayValidator,
  attachGatewayValidator,
  completeGatewayEnrollmentValidator,
  gatewayEnrollmentCodeValidator,
  updateGatewayValidator,
} from '#validators/gateway'
import { Exception } from '@adonisjs/core/exceptions'
import type { HttpContext } from '@adonisjs/core/http'
import { ensureAllowedSshAddress } from '#services/gateway_ssh_address_policy'
import { createHash, randomUUID } from 'node:crypto'
import SharedCacheService from '#services/shared_cache_service'

const DEFAULT_NETWORK_OPERATIONS_LIMIT = 20
const MAX_NETWORK_OPERATIONS_LIMIT = 100
const MAX_PAGE = 10_000
const VPN_PROFILE_CACHE_TTL_MS = 30_000
const PROFILE_ENROLLMENT_TTL_MS = 15 * 60 * 1000

async function getActiveEnrollment(trx: TransactionClientContract, tokenHash: string) {
  const enrollment = await trx
    .from('gateway_enrollments')
    .where('token_hash', tokenHash)
    .whereNull('claimed_at')
    .where('expires_at', '>', new Date())
    .first()
  if (!enrollment) {
    throw new Exception('Enrollment code is invalid, expired, or already used.', {
      status: 404,
      code: 'E_GATEWAY_ENROLLMENT_CODE_INVALID',
    })
  }
  return enrollment
}
type VpnProfile = { format: 'openvpn' | 'wireguard'; content: string }
const vpnProfileCache = new Map<string, { expiresAt: number; value: VpnProfile }>()
const vpnProfileInflight = new Map<string, Promise<VpnProfile>>()
const DEFAULT_GATEWAYS_LIMIT = 20
const MAX_GATEWAYS_LIMIT = 100

function parsePaginationParameter(value: unknown, fallback: number, maximum: number) {
  const parsed = Number(value)

  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    return fallback
  }

  return Math.min(parsed, maximum)
}

function gatewayResponse(gateway: Gateway) {
  return {
    id: gateway.id,
    name: gateway.name,
    gatewayEui: gateway.gatewayEui,
    location: gateway.location,
    managementIpAddress: gateway.managementIpAddress,
    wanIpAddress: gateway.wanIpAddress,
    status: gateway.status,
    lastSeenAt: gateway.lastSeenAt,
    createdAt: gateway.createdAt,
    updatedAt: gateway.updatedAt,
  }
}

export default class GatewaysController {
  async renewEnrollment({ auth, params, response }: HttpContext) {
    auth.getUserOrFail()
    const gatewayId = Number(params.id)
    if (!Number.isSafeInteger(gatewayId) || gatewayId < 1) return response.badRequest({ message: 'Invalid gateway id' })
    return response.ok(await new GatewayProvisioningService().renewEnrollment(gatewayId))
  }
  async discover({ response }: HttpContext) {
    const found: Array<{ ip: string; mac: string; model: string; serial: string }> = []
    await Promise.all(Array.from({ length: 254 }, (_, i) => `10.42.0.${i + 1}`).map(async (ip) => {
      try {
        const result = await fetch(`http://${ip}/cgi-bin/saganexus_enroll.cgi?identity=1`, { redirect: 'manual', signal: AbortSignal.timeout(900) })
        if (!result.ok) return
        const identity = await result.json() as Record<string, unknown>
        if (typeof identity.mac === 'string' && typeof identity.model === 'string') {
          found.push({ ip, mac: identity.mac, model: identity.model, serial: typeof identity.serial === 'string' ? identity.serial : '' })
        }
      } catch {}
    }))
    return response.ok({ gateways: found })
  }
  /**
   * Display a list of resource
   */
  async index({ request, response }: HttpContext) {
    const page = parsePaginationParameter(request.input('page'), 1, MAX_PAGE)
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
      gatewaysList: gateways.all().map(gatewayResponse),
      meta: gateways.getMeta(),
      summary,
    })
  }

  /**
   * Display form to create a new record
   */
  async attach({ request, response }: HttpContext) {
    const payload = await request.validateUsing(attachGatewayValidator)
    const gateway = await new GatewayProvisioningService().attach(payload)
    return response.created({ message: 'gateway attached', gateway: gatewayResponse(gateway) })
  }

  async store({ request, response }: HttpContext) {
    const payload = await request.validateUsing(createGatewayValidator)
    const { gateway, enrollmentCode } =
      await new GatewayProvisioningService().createWithEnrollmentCode(payload)
    response.header('Cache-Control', 'no-store')
    return response.created({ message: 'gateway created', gateway: gatewayResponse(gateway), enrollmentCode })
  }

  /** Bootstrap agents redeem the temporary code and pull their VPN configuration. */
  async enroll({ request, response }: HttpContext) {
    const { code } = await request.validateUsing(gatewayEnrollmentCodeValidator)
    const tokenHash = createHash('sha256').update(code).digest('hex')
    const attempt = await db.transaction(async (trx) => {
      const enrollment = await getActiveEnrollment(trx, tokenHash)
      const gatewayId = enrollment.gateway_id as number
      const previous = await lockGatewayForPairing(trx, gatewayId, true)
      await getActiveEnrollment(trx, tokenHash)
      const owner = previous?.payload.replace(/:(approved|ready)$/, '') ?? 'direct'
      const payload = `${owner}:fetching:${randomUUID()}`
      const expiresAt = new Date(Date.now() + PROFILE_ENROLLMENT_TTL_MS)
      await saveGatewayPairing(trx, gatewayId, payload, expiresAt)
      return { gatewayId, owner, payload, previous }
    })
    const currentAttempt = (client: TransactionClientContract | typeof db = db) =>
      client
        .from('saganexus_shared_cache')
        .where({ key: gatewayPairingKey(attempt.gatewayId), payload: attempt.payload })
        .where('expires_at', '>', new Date())

    try {
      const gateway = await Gateway.findOrFail(attempt.gatewayId)
      const connectorId = gatewayVpnResources(gateway).connectorId
      if (!connectorId) {
        throw new Exception('Gateway has no VPN connector', {
          status: 404,
          code: 'E_GATEWAY_NO_CONNECTOR',
        })
      }
      const provider = await resolveVpnProvider(gateway.vpnProvider)
      const profile = await requireVpnProfile(provider, 'openvpn')(connectorId, 'openvpn')
      if (!profile || profile.format !== 'openvpn' || typeof profile.content !== 'string') {
        throw new Exception('VPN provider returned an unsupported profile.', {
          status: 502,
          code: 'E_VPN_PROFILE_INVALID',
        })
      }
      const ready = await db.transaction(async (trx) => {
        await trx.from('gateways').where('id', attempt.gatewayId).forUpdate().firstOrFail()
        await getActiveEnrollment(trx, tokenHash)
        return currentAttempt(trx).update({ payload: `${attempt.owner}:ready` }, ['key'])
      })
      if (!ready.length) {
        throw new Exception('A tentativa de conexão expirou. Tente novamente.', {
          status: 409,
          code: 'E_GATEWAY_CONNECTION_EXPIRED',
        })
      }

      response.header('Cache-Control', 'no-store')
      return response.ok({
        gateway: { id: gateway.id, managementIpAddress: gateway.managementIpAddress },
        vpn: {
          provider: gateway.vpnProvider,
          format: profile.format,
          contentBase64: Buffer.from(profile.content, 'utf8').toString('base64'),
        },
      })
    } catch (error) {
      if (!(error instanceof Exception && error.code === 'E_GATEWAY_ENROLLMENT_CODE_INVALID')) {
        await currentAttempt()
          .update({
            payload: attempt.previous?.payload ?? attempt.payload,
            expires_at: attempt.previous?.expires_at ?? new Date(),
          })
          .catch(() => undefined)
      }
      throw error
    }
  }

  /** The agent acknowledges only after saving and activating the downloaded profile. */
  async completeEnrollment({ request, response }: HttpContext) {
    const { code, sshHostKeyFingerprint } = await request.validateUsing(
      completeGatewayEnrollmentValidator
    )
    const tokenHash = createHash('sha256').update(code).digest('hex')
    await db.transaction(async (trx) => {
      const candidate = await getActiveEnrollment(trx, tokenHash)
      const gateway = await trx
        .from('gateways')
        .where('id', candidate.gateway_id)
        .forUpdate()
        .firstOrFail()
      const enrollment = await getActiveEnrollment(trx, tokenHash)
      const existingFingerprint = gateway.ssh_host_key_fingerprint?.replace(/=+$/, '')
      if (existingFingerprint && existingFingerprint !== sshHostKeyFingerprint) {
        throw new Exception('Enrollment cannot replace a registered SSH host key.', {
          status: 409,
          code: 'E_GATEWAY_SSH_HOST_KEY_MISMATCH',
        })
      }

      await trx.from('gateways').where('id', gateway.id).update({
        ssh_host_key_fingerprint: sshHostKeyFingerprint,
        updated_at: new Date(),
      })
      await trx.from('gateway_enrollments').where('id', enrollment.id).update({
        claimed_at: new Date(),
        updated_at: new Date(),
      })
    })

    return response.noContent()
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
    const getProfile = requireVpnProfile(provider)
    const formats = {
      openvpn: { extension: 'ovpn', contentType: 'application/x-openvpn-profile' },
      wireguard: { extension: 'conf', contentType: 'text/plain' },
    }
    const allowsFormat = (format: VpnProfile['format']) =>
      Object.hasOwn(formats, format) && (provider.profileFormats?.includes(format) ?? true)
    const cacheKey = `vpn-profile:${gateway.vpnProvider}:${gateway.id}:${connectorId}`
    const now = Date.now()
    const cached = vpnProfileCache.get(cacheKey)
    const sharedCache = new SharedCacheService()
    const shared = await sharedCache.get<VpnProfile>(cacheKey)
    let profile = cached && cached.expiresAt > now ? cached.value : shared ?? undefined
    if (!profile) {
      const pending = vpnProfileInflight.get(cacheKey)
      const request = pending ?? (async () => {
        const result = await getProfile(connectorId)
        if (!result || typeof result.content !== 'string' || !allowsFormat(result.format)) {
          throw new Exception('VPN provider returned an unsupported profile.', {
            status: 502,
            code: 'E_VPN_PROFILE_INVALID',
          })
        }
        const value: VpnProfile = { format: result.format as VpnProfile['format'], content: result.content }
        vpnProfileCache.set(cacheKey, { expiresAt: Date.now() + VPN_PROFILE_CACHE_TTL_MS, value })
        await sharedCache.put(cacheKey, value, VPN_PROFILE_CACHE_TTL_MS)
        return value
      })()
      vpnProfileInflight.set(cacheKey, request)
      try {
        profile = await request
      } finally {
        vpnProfileInflight.delete(cacheKey)
      }
    }

    const format = profile && allowsFormat(profile.format) ? formats[profile.format] : undefined
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
      gateway: gatewayResponse(gateway),
    })
  }

  async networkOperations({ params, request, response }: HttpContext) {
    const gateway = await Gateway.findOrFail(params.id)
    const page = parsePaginationParameter(request.input('page'), 1, MAX_PAGE)
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
        errorMessage: operation.errorCode ? 'Não foi possível concluir a operação. Consulte o código de erro ou contate o suporte.' : null,
        requestedByEmail: operation.requestedByEmail,
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
      if (payload.name !== gateway.name?.trim()) {
        await assertGatewayNameAvailable(trx, payload.name, { gatewayId: gateway.id })
      }
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
      gateway: gatewayResponse(gatewayUpdate),
    })
  }

  /**
   * Delete record
   */
  async destroy({ params, response }: HttpContext) {
    const gateway = await Gateway.findOrFail(params.id)

    // Remove remote resources first; if it fails, keep the record and its provider binding.
    const binding = gatewayVpnResources(gateway)
    if (binding.ownership !== 'attached' && binding.networkId) {
      const provider = requireManagedVpnProvider(await resolveVpnProvider(gateway.vpnProvider))
      await provider.deleteGateway(binding.networkId, { allowMissing: true })
    }

    await gateway.delete()

    return response.noContent()
  }
}
