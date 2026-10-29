import db from '@adonisjs/lucid/services/db'
import { Exception } from '@adonisjs/core/exceptions'
import { randomUUID } from 'node:crypto'
import Gateway from '#models/gateway'
import GatewayService from '#services/gateway_service'
import CloudConnexaService from '#services/cloud_connexa_service'
import { ensureAllowedSshAddress } from '#services/gateway_ssh_address_policy'

type Payload = {
  name: string
  managementIpAddress?: string
  gatewayEui?: string
  location?: string
  sshHostKeyFingerprint?: string
}
type Cloud = Pick<CloudConnexaService, 'createGatewayResources' | 'deleteNetwork'>
export const MANAGEMENT_IP_LOCK = 73624711

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
  constructor(private cloud: Cloud = new CloudConnexaService()) {}

  async create(payload: Payload) {
    const token = randomUUID()
    const managementIpAddress = await db.transaction(async (trx) => {
      await trx.rawQuery("SET LOCAL lock_timeout = '5s'")
      await trx.rawQuery('SELECT pg_advisory_xact_lock(?)', [MANAGEMENT_IP_LOCK])
      const address =
        payload.managementIpAddress ?? (await new GatewayService().allocateManagementIp(trx))
      ensureAllowedSshAddress(address)
      const normalized = await trx.rawQuery('SELECT host(?::inet) AS address', [address])
      const ip = normalized.rows[0].address as string
      const existing = await trx
        .from('gateways')
        .whereRaw('management_ip_address::inet = ?::inet', [ip])
        .first()
      const reserved = await trx
        .from('gateway_ip_reservations')
        .where('management_ip_address', ip)
        .first()
      if (existing || reserved) throw managementIpConflict()
      await trx.table('gateway_ip_reservations').insert({ management_ip_address: ip, token })
      return ip
    })

    let networkId: string | undefined
    try {
      const vpn = await this.cloud.createGatewayResources(
        new GatewayService().toNetworkName(payload.name),
        managementIpAddress,
        async (createdNetworkId) => {
          networkId = createdNetworkId
          await db
            .from('gateway_ip_reservations')
            .where('token', token)
            .update({ network_id: networkId, updated_at: new Date() })
        }
      )
      networkId = vpn.networkId
      return await db.transaction(async (trx) => {
        const gateway = await Gateway.create(
          {
            ...payload,
            managementIpAddress,
            ccNetworkId: vpn.networkId,
            ccConnectorId: vpn.connectorId,
            ccIpServiceId: vpn.ipServiceId,
          },
          { client: trx }
        )
        await trx.from('gateway_ip_reservations').where('token', token).delete()
        return gateway
      })
    } catch (error) {
      if (networkId) {
        await db
          .from('gateway_ip_reservations')
          .where('token', token)
          .update({ network_id: networkId, status: 'cleanup_required', updated_at: new Date() })
        try {
          await this.cloud.deleteNetwork(networkId)
        } catch {
          throw new Exception(
            'Provisioning failed; resource cleanup is pending and the IP remains reserved.',
            { status: 503, code: 'E_GATEWAY_PROVISIONING_CLEANUP_PENDING' }
          )
        }
        await db.from('gateway_ip_reservations').where('token', token).delete()
      } else {
        const code = (error as { code?: string })?.code ?? ''
        // A definitive rejected POST created nothing. A lost response is ambiguous.
        if (/^E_CLOUDCONNEXA_4\d\d$/.test(code) && code !== 'E_CLOUDCONNEXA_408') {
          await db.from('gateway_ip_reservations').where('token', token).delete()
        } else {
          await db
            .from('gateway_ip_reservations')
            .where('token', token)
            .update({ status: 'reconciliation_required', updated_at: new Date() })
          throw new Exception(
            'Provisioning outcome requires reconciliation; the IP remains reserved.',
            { status: 503, code: 'E_GATEWAY_PROVISIONING_RECONCILIATION_REQUIRED' }
          )
        }
      }
      rethrowManagementIpConflict(error)
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
      await this.cloud.deleteNetwork(reservation.network_id)
      await trx.from('gateway_ip_reservations').where('id', id).delete()
      return true
    })
  }
}
