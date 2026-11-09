import Gateway from '#models/gateway'
import env from '#start/env'
import { Exception } from '@adonisjs/core/exceptions'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'

type GatewayAddress = {
  managementIpAddress?: string | null
}

export default class GatewayService {
  ensureHasAtLeastOneAddress(gateway: GatewayAddress) {
    if (!gateway.managementIpAddress) {
      throw new Exception('Missing gateway management IP', {
        status: 422,
        code: 'E_GATEWAY_ADDRESS_REQUIRED',
      })
    }
  }

  /**
   * Picks the first free management IP in <prefix>.2 .. <prefix>.254.
   * (.1 is reserved for the original test gateway.)
   */
  async allocateManagementIp(client: TransactionClientContract): Promise<string> {
    const prefix = env.get('GATEWAY_MGMT_IP_PREFIX', '10.200.0')
    const gateways = await Gateway.query({ client })
      .whereNotNull('management_ip_address')
      .select('management_ip_address')
    const used = new Set(gateways.map((gateway) => gateway.managementIpAddress))
    const reservations = await client
      .from('gateway_ip_reservations')
      .select('management_ip_address')
    for (const reservation of reservations) used.add(reservation.management_ip_address)

    for (let host = 2; host <= 254; host++) {
      const ip = `${prefix}.${host}`
      if (!used.has(ip)) return ip
    }

    throw new Exception('No free management IP available', {
      status: 409,
      code: 'E_GATEWAY_IP_POOL_EXHAUSTED',
    })
  }

  async ensureManagementIpIsFree(ip: string) {
    const existing = await Gateway.findBy('management_ip_address', ip)
    if (existing) {
      throw new Exception(`Management IP ${ip} already in use`, {
        status: 409,
        code: 'E_GATEWAY_IP_IN_USE',
      })
    }
  }

  /** CloudConnexa-safe name: letters, digits and dashes. */
  toNetworkName(name: string): string {
    const slug = name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40)
    return `gw-${slug || 'gateway'}`
  }
}
