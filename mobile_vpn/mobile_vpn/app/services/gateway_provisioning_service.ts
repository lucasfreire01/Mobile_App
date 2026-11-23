import db from '@adonisjs/lucid/services/db'
import { Exception } from '@adonisjs/core/exceptions'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import Gateway from '#models/gateway'
import GatewayService from '#services/gateway_service'
import {
  gatewayVpnAttributes,
  requireManagedVpnProvider,
  requireVpnProfile,
  resolveVpnProvider,
} from '#services/vpn/registry'
import {
  VpnProvisioningRejectedError,
  type ConfiguredVpnProvider,
  type ManagedVpnProvider,
} from '#services/vpn/types'
import { ensureAllowedSshAddress } from '#services/gateway_ssh_address_policy'

type Payload = {
  name: string
  managementIpAddress?: string
  gatewayEui?: string
  location?: string
  sshHostKeyFingerprint?: string
}
type AttachPayload = Payload & { providerId: string; reference: string; sshHostKeyFingerprint: string }
export const MANAGEMENT_IP_LOCK = 73624711
const NAME_RESERVATION_TTL_MS = 15 * 60 * 1000

export async function assertGatewayNameAvailable(
  trx: TransactionClientContract,
  name: string,
  options: { gatewayId?: number; reservationToken?: string } = {}
) {
  const gateway = trx.from('gateways').whereRaw('lower(btrim(name)) = lower(btrim(?::text))', [name])
  if (options.gatewayId !== undefined) gateway.whereNot('id', options.gatewayId)

  const normalized = await trx.rawQuery('SELECT lower(btrim(?::text)) AS name', [name])
  const nameHash = createHash('sha256').update(normalized.rows[0].name).digest('hex')
  const key = `gateway-name-reservation:${nameHash}`
  const reservation = trx
    .from('saganexus_shared_cache')
    .where('key', key)
    .where('expires_at', '>', new Date())
  const pendingSessionProvisioning = trx.from('gateway_ip_reservations').where('gateway_name_key', key)
  if (options.reservationToken) {
    reservation.whereNot('payload', options.reservationToken)
    pendingSessionProvisioning.whereNot('token', options.reservationToken)
  }

  if (
    (await gateway.first()) ||
    (await reservation.first()) ||
    (await pendingSessionProvisioning.first())
  ) {
    throw new Exception('Já existe um gateway com esse nome ou com cadastro em andamento.', {
      status: 409,
      code: 'E_GATEWAY_NAME_IN_USE',
    })
  }
  return key
}

export function gatewayPairingKey(gatewayId: number) {
  return `gateway-pairing:${gatewayId}`
}

export async function saveGatewayPairing(
  trx: TransactionClientContract,
  gatewayId: number,
  payload: string,
  expiresAt: Date
) {
  await trx
    .table('saganexus_shared_cache')
    .insert({ key: gatewayPairingKey(gatewayId), payload, expires_at: expiresAt })
    .onConflict('key')
    .merge()
}

export async function lockGatewayForPairing(
  trx: TransactionClientContract,
  gatewayId: number,
  allowEnrollmentReplay = false
): Promise<{ payload: string; expires_at: Date } | undefined> {
  const gateway = await trx.from('gateways').where('id', gatewayId).forUpdate().first()
  if (!gateway) {
    throw new Exception('Gateway not found', { status: 404, code: 'E_GATEWAY_NOT_FOUND' })
  }
  if (gateway.status === 'online') {
    throw new Exception('Este gateway já está conectado.', {
      status: 409,
      code: 'E_GATEWAY_ALREADY_CONNECTED',
    })
  }

  const activePairing = await trx
    .from('saganexus_shared_cache')
    .where('key', gatewayPairingKey(gatewayId))
    .where('expires_at', '>', new Date())
    .first()
  if (
    activePairing &&
    (!allowEnrollmentReplay || !/:(approved|ready)$/.test(activePairing.payload))
  ) {
    throw new Exception('Já existe uma tentativa de conexão em andamento para este gateway.', {
      status: 409,
      code: 'E_GATEWAY_CONNECTION_IN_PROGRESS',
    })
  }
  return activePairing
}

export function managementIpConflict() {
  return new Exception('Management IP already in use or reserved.', {
    status: 409,
    code: 'E_GATEWAY_IP_IN_USE',
  })
}

export function rethrowManagementIpConflict(error: unknown): never {
  const cause = error as { code?: string; constraint?: string }
  if (cause?.code === '23505' && cause.constraint === 'gateways_management_ip_address_unique')
    throw managementIpConflict()
  throw error
}

export default class GatewayProvisioningService {
  async renewEnrollment(gatewayId: number) {
    const enrollmentCode = randomBytes(32).toString('base64url')
    const tokenHash = createHash('sha256').update(enrollmentCode).digest('hex')
    await db.transaction(async (trx) => {
      await lockGatewayForPairing(trx, gatewayId)
      const gateway = await Gateway.findOrFail(gatewayId, { client: trx })
      requireVpnProfile(await resolveVpnProvider(gateway.vpnProvider), 'openvpn')
      const enrollment = await trx.from('gateway_enrollments').where('gateway_id', gatewayId).first()
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000)
      if (enrollment) {
        await trx.from('gateway_enrollments').where('id', enrollment.id).update({ token_hash: tokenHash, expires_at: expiresAt, claimed_at: null, updated_at: new Date() })
      } else {
        await trx.table('gateway_enrollments').insert({ gateway_id: gatewayId, token_hash: tokenHash, expires_at: expiresAt, created_at: new Date(), updated_at: new Date() })
      }
    })
    return { enrollmentCode }
  }
  constructor(private provider?: ConfiguredVpnProvider) {}

  async create(payload: Payload) {
    const provider = requireManagedVpnProvider(this.provider ?? (await resolveVpnProvider()))
    return this.provision(payload, provider)
  }

  async createWithEnrollmentCode(payload: Payload) {
    const provider = requireManagedVpnProvider(this.provider ?? (await resolveVpnProvider()))
    requireVpnProfile(provider, 'openvpn')
    const enrollmentCode = randomBytes(32).toString('base64url')
    const gateway = await this.provision(payload, provider, enrollmentCode)
    return { gateway, enrollmentCode }
  }

  async attach({ providerId, reference, ...payload }: AttachPayload) {
    const provider = await resolveVpnProvider(providerId)
    if (provider.lifecycle !== 'attached') {
      throw new Exception('The selected VPN provider does not support attaching gateways.', {
        status: 422,
        code: 'E_VPN_ATTACHMENT_UNSUPPORTED',
      })
    }
    const usesSessionAddress = provider.managementAddressMode === 'session'
    if (usesSessionAddress === Boolean(payload.managementIpAddress)) {
      throw new Exception('The management IP must match the address mode of the VPN provider.', {
        status: 422,
        code: usesSessionAddress ? 'E_VPN_STATIC_MANAGEMENT_IP_UNSUPPORTED' : 'E_GATEWAY_IP_REQUIRED',
      })
    }
    const managementIpAddress = payload.managementIpAddress
      ? ensureAllowedSshAddress(payload.managementIpAddress)
      : null
    const binding = await provider.attachGateway(reference)
    if (
      !binding ||
      typeof binding !== 'object' ||
      'networkId' in binding ||
      typeof binding.connectorId !== 'string' ||
      !binding.connectorId.trim() ||
      (binding.routeId !== undefined &&
        (typeof binding.routeId !== 'string' || !binding.routeId.trim()))
    ) {
      throw new Exception('VPN provider returned an invalid external gateway binding.', {
        status: 502,
        code: 'E_VPN_RESOURCES_INVALID',
      })
    }
    const name = payload.name.trim()
    try {
      return await db.transaction(async (trx) => {
        await trx.rawQuery("SET LOCAL lock_timeout = '5s'")
        await trx.rawQuery('SELECT pg_advisory_xact_lock(?)', [MANAGEMENT_IP_LOCK])
        await assertGatewayNameAvailable(trx, name)
        if (managementIpAddress) {
          await this.ensureManagementIpAvailable(trx, managementIpAddress)
        }
        const existing = await trx
          .from('gateways')
          .where('vpn_provider', provider.id)
          .whereRaw("vpn_resources ->> 'connectorId' = ?", [binding.connectorId])
          .first()
        if (existing) {
          throw new Exception('The external VPN gateway is already bound.', {
            status: 409,
            code: 'E_VPN_ATTACHMENT_IN_USE',
          })
        }
        return Gateway.create(
          {
            ...payload,
            name,
            managementIpAddress,
            vpnProvider: provider.id,
            vpnResources: {
              ownership: 'attached',
              connectorId: binding.connectorId,
              ...(binding.routeId === undefined ? {} : { routeId: binding.routeId }),
            },
          },
          { client: trx }
        )
      })
    } catch (error) {
      rethrowManagementIpConflict(error)
    }
  }

  private async ensureManagementIpAvailable(trx: TransactionClientContract, address: string) {
    const existing = await trx
      .from('gateways')
      .whereRaw('management_ip_address::inet = ?::inet', [address])
      .first()
    const reserved = await trx
      .from('gateway_ip_reservations')
      .where('management_ip_address', address)
      .first()
    if (existing || reserved) throw managementIpConflict()
  }

  private async provision(
    payload: Payload,
    provider: ManagedVpnProvider,
    enrollmentCode?: string
  ): Promise<Gateway> {
    const name = payload.name.trim()
    const usesSessionAddress = provider.managementAddressMode === 'session'
    if (usesSessionAddress && payload.managementIpAddress !== undefined) {
      throw new Exception('The bound VPN provider assigns the management address per session.', {
        status: 422,
        code: 'E_VPN_STATIC_MANAGEMENT_IP_UNSUPPORTED',
      })
    }
    const token = randomUUID()
    const enrollmentTokenHash = enrollmentCode && createHash('sha256').update(enrollmentCode).digest('hex')
    const enrollmentExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000)
    const { managementIpAddress, nameReservationKey } = await db.transaction(async (trx) => {
      await trx.rawQuery("SET LOCAL lock_timeout = '5s'")
      await trx.rawQuery('SELECT pg_advisory_xact_lock(?)', [MANAGEMENT_IP_LOCK])
      const key = await assertGatewayNameAvailable(trx, name)
      let ip: string | null = null
      if (!usesSessionAddress) {
        const address =
          payload.managementIpAddress ?? (await new GatewayService().allocateManagementIp(trx))
        ensureAllowedSshAddress(address)
        const normalized = await trx.rawQuery('SELECT host(?::inet) AS address', [address])
        ip = normalized.rows[0].address as string
        await this.ensureManagementIpAvailable(trx, ip)
      }
      await trx.table('gateway_ip_reservations').insert({
        management_ip_address: ip,
        gateway_name_key: usesSessionAddress ? key : null,
        token,
        vpn_provider: provider.id,
      })
      await trx
        .table('saganexus_shared_cache')
        .insert({ key, payload: token, expires_at: new Date(Date.now() + NAME_RESERVATION_TTL_MS) })
        .onConflict('key')
        .merge()
      return { managementIpAddress: ip, nameReservationKey: key }
    })

    let networkId: string | undefined
    try {
      const networkName = new GatewayService().toNetworkName(name)
      const recordOwnedResource = async (createdNetworkId: string) => {
        networkId = createdNetworkId
        await db
          .from('gateway_ip_reservations')
          .where('token', token)
          .update({ network_id: networkId, updated_at: new Date() })
      }
      const vpn = usesSessionAddress
        ? await provider.createGateway(networkName, null, recordOwnedResource)
        : await provider.createGateway(networkName, managementIpAddress!, recordOwnedResource)
      if (!usesSessionAddress) networkId = vpn?.networkId || networkId
      if (
        !vpn ||
        (usesSessionAddress && (!networkId || vpn.networkId !== networkId)) ||
        ![
          vpn.networkId,
          vpn.connectorId,
          ...(provider.updateRoutes || vpn.routeId !== undefined ? [vpn.routeId] : []),
        ].every(
          (id) => typeof id === 'string' && id.trim().length > 0
        )
      ) {
        throw new Exception('VPN provider returned incomplete resources.', {
          status: 502,
          code: 'E_VPN_RESOURCES_INVALID',
        })
      }
      return await db.transaction(async (trx) => {
        await trx.rawQuery("SET LOCAL lock_timeout = '5s'")
        await trx.rawQuery('SELECT pg_advisory_xact_lock(?)', [MANAGEMENT_IP_LOCK])
        await assertGatewayNameAvailable(trx, name, { reservationToken: token })
        const gateway = await Gateway.create(
          {
            ...payload,
            name,
            managementIpAddress,
            ...gatewayVpnAttributes(provider.id, vpn),
          },
          { client: trx }
        )
        await trx.from('gateway_ip_reservations').where('token', token).delete()
        if (enrollmentTokenHash) {
          await trx.table('gateway_enrollments').insert({
            gateway_id: gateway.id,
            token_hash: enrollmentTokenHash,
            expires_at: enrollmentExpiresAt,
            created_at: new Date(),
            updated_at: new Date(),
          })
        }
        return gateway
      })
    } catch (error) {
      if (networkId) {
        await db
          .from('gateway_ip_reservations')
          .where('token', token)
          .update({ network_id: networkId, status: 'cleanup_required', updated_at: new Date() })
        try {
          await provider.deleteGateway(networkId)
        } catch {
          throw new Exception(
            'Provisioning failed; resource cleanup is pending and the reservation remains active.',
            { status: 503, code: 'E_GATEWAY_PROVISIONING_CLEANUP_PENDING' }
          )
        }
        await db.from('gateway_ip_reservations').where('token', token).delete()
      } else {
        // A definitive rejected POST created nothing. A lost response is ambiguous.
        if (error instanceof VpnProvisioningRejectedError) {
          await db.from('gateway_ip_reservations').where('token', token).delete()
        } else {
          await db
            .from('gateway_ip_reservations')
            .where('token', token)
            .update({ status: 'reconciliation_required', updated_at: new Date() })
          throw new Exception(
            'Provisioning outcome requires reconciliation; the reservation remains active.',
            { status: 503, code: 'E_GATEWAY_PROVISIONING_RECONCILIATION_REQUIRED' }
          )
        }
      }
      rethrowManagementIpConflict(error)
    } finally {
      await db
        .from('saganexus_shared_cache')
        .where({ key: nameReservationKey, payload: token })
        .update({ expires_at: new Date() })
        .catch(() => undefined)
    }
  }

  async retryCleanup(id: number) {
    return db.transaction(async (trx) => {
      const reservation = await trx
        .from('gateway_ip_reservations')
        .where('id', id)
        .where('status', 'cleanup_required')
        .forUpdate()
        .skipLocked()
        .first()
      if (!reservation?.network_id) return false
      const injected = this.provider
      const provider =
        injected && injected.id === reservation.vpn_provider
          ? injected
          : await resolveVpnProvider(reservation.vpn_provider)
      await requireManagedVpnProvider(provider).deleteGateway(reservation.network_id)
      await trx.from('gateway_ip_reservations').where('id', id).delete()
      return true
    })
  }
}
