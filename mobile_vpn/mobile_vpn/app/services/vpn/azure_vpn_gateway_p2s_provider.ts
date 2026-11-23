import { Exception } from '@adonisjs/core/exceptions'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { ensureAllowedSshAddress } from '#services/gateway_ssh_address_policy'
import type { AttachedVpnProvider } from '#services/vpn/types'

const run = promisify(execFile)
const resourceIdPattern =
  /^\/subscriptions\/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\/resourceGroups\/[\w.()-]{1,90}\/providers\/Microsoft\.Network\/virtualNetworkGateways\/[\w.-]{1,80}$/i

type ReadConnectionHealth = (resourceId: string, signal?: AbortSignal) => Promise<unknown>

function connectionHealthReader(timeout: number): ReadConnectionHealth {
  return async (resourceId, signal) => {
    const { stdout } = await run(
      'az',
      [
        'network',
        'vnet-gateway',
        'vpn-client',
        'show-health',
        '--ids',
        resourceId,
        '--output',
        'json',
        '--only-show-errors',
      ],
      { signal, timeout, maxBuffer: 2 * 1024 * 1024 }
    )
    return JSON.parse(stdout)
  }
}

export default class AzureVpnGatewayP2sProvider implements AttachedVpnProvider {
  readonly id = 'azure_vpn_gateway_p2s'
  readonly lifecycle = 'attached'
  readonly managementAddressMode = 'session'
  private readonly readHealth: ReadConnectionHealth

  constructor(
    private readonly resourceId: string | undefined,
    options: { timeoutMs?: number; readHealth?: ReadConnectionHealth } = {}
  ) {
    const timeoutMs = options.timeoutMs ?? 10_000
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 60_000) {
      throw new Exception('Azure VPN session lookup timeout is invalid.', {
        status: 503,
        code: 'E_VPN_PROVIDER_NOT_CONFIGURED',
      })
    }
    this.readHealth = options.readHealth ?? connectionHealthReader(timeoutMs)
  }

  async attachGateway(reference: string) {
    const address = await this.resolveManagementAddress(reference)
    if (!address) {
      throw new Exception('No matching Azure OpenVPN session is visible.', {
        status: 422,
        code: 'E_AZURE_VPN_SESSION_NOT_FOUND',
      })
    }
    return { connectorId: reference }
  }

  async resolveManagementAddress(connectorId: string, signal?: AbortSignal) {
    const resourceId = this.resourceId
    if (!resourceId || !resourceIdPattern.test(resourceId)) {
      throw new Exception('The Azure VPN gateway resource ID is not configured or is invalid.', {
        status: 503,
        code: 'E_VPN_PROVIDER_NOT_CONFIGURED',
      })
    }
    if (signal?.aborted) throw new Error('Gateway monitoring cancelled')
    let result: unknown
    try {
      result = await this.readHealth(resourceId, signal)
    } catch {
      if (signal?.aborted) throw new Error('Gateway monitoring cancelled')
      throw new Exception('Azure VPN session lookup failed.', {
        status: 503,
        code: 'E_AZURE_VPN_SESSION_LOOKUP_FAILED',
      })
    }
    if (signal?.aborted) throw new Error('Gateway monitoring cancelled')
    if (!result || typeof result !== 'object' || !('value' in result) || !Array.isArray(result.value)) {
      throw this.invalidHealth()
    }
    const matches: string[] = []
    for (const session of result.value as unknown[]) {
      if (
        !session ||
        typeof session !== 'object' ||
        !('vpnUserName' in session) ||
        typeof session.vpnUserName !== 'string' ||
        !('vpnConnectionId' in session) ||
        typeof session.vpnConnectionId !== 'string'
      ) {
        throw this.invalidHealth()
      }
      if (session.vpnUserName !== connectorId || !session.vpnConnectionId.startsWith('OVPN_')) {
        continue
      }
      if (!('privateIpAddress' in session) || typeof session.privateIpAddress !== 'string') {
        throw this.invalidHealth()
      }
      matches.push(session.privateIpAddress)
    }
    if (matches.length > 1) {
      throw new Exception('Azure reported multiple OpenVPN sessions for this gateway identity.', {
        status: 503,
        code: 'E_AZURE_VPN_SESSION_AMBIGUOUS',
      })
    }
    return matches.length === 1 ? ensureAllowedSshAddress(matches[0]) : null
  }

  private invalidHealth() {
    return new Exception('Azure returned an invalid VPN session health response.', {
      status: 502,
      code: 'E_AZURE_VPN_SESSION_RESPONSE_INVALID',
    })
  }
}
