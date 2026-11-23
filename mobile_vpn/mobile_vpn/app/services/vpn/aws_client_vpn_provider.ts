import { Exception } from '@adonisjs/core/exceptions'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { ensureAllowedSshAddress } from '#services/gateway_ssh_address_policy'
import type { AttachedVpnProvider } from '#services/vpn/types'

const run = promisify(execFile)
type Endpoint = { id: string; region: string }
type ReadConnections = (endpoint: Endpoint, signal?: AbortSignal) => Promise<unknown>

const readConnections: ReadConnections = async ({ id, region }, signal) => {
  const { stdout } = await run(
    'aws',
    [
      'ec2',
      'describe-client-vpn-connections',
      '--client-vpn-endpoint-id',
      id,
      '--region',
      region,
      '--output',
      'json',
      '--no-cli-pager',
      '--no-cli-auto-prompt',
      '--query',
      '{Connections:Connections[].{ClientVpnEndpointId:ClientVpnEndpointId,CommonName:CommonName,ClientIp:ClientIp,Status:Status.Code},NextToken:NextToken}',
    ],
    { signal, timeout: 10_000, maxBuffer: 2 * 1024 * 1024 }
  )
  return JSON.parse(stdout)
}

function invalidConnections() {
  return new Exception('AWS returned an invalid Client VPN connection response.', {
    status: 502,
    code: 'E_AWS_CLIENT_VPN_RESPONSE_INVALID',
  })
}

export default class AwsClientVpnProvider implements AttachedVpnProvider {
  readonly id = 'aws_client_vpn'
  readonly lifecycle = 'attached'
  readonly managementAddressMode = 'session'

  constructor(
    private readonly endpointId: string | undefined,
    private readonly region: string | undefined,
    private readonly readHealth: ReadConnections = readConnections
  ) {}

  async attachGateway(reference: string) {
    if (!(await this.resolveManagementAddress(reference))) {
      throw new Exception('No matching AWS Client VPN session is active.', {
        status: 422,
        code: 'E_AWS_CLIENT_VPN_SESSION_NOT_FOUND',
      })
    }
    return { connectorId: reference }
  }

  async resolveManagementAddress(connectorId: string, signal?: AbortSignal) {
    const { endpointId, region } = this
    if (!endpointId || !/^cvpn-endpoint-[0-9a-f]+$/.test(endpointId) || !region ||
        !/^[a-z]{2}(?:-[a-z0-9]+)+-[0-9]+$/.test(region)) {
      throw new Exception('The AWS Client VPN endpoint and region must be configured.', {
        status: 503,
        code: 'E_VPN_PROVIDER_NOT_CONFIGURED',
      })
    }
    if (signal?.aborted) throw new Error('Gateway monitoring cancelled')
    let result: unknown
    try {
      result = await this.readHealth({ id: endpointId, region }, signal)
    } catch {
      if (signal?.aborted) throw new Error('Gateway monitoring cancelled')
      throw new Exception('AWS Client VPN session lookup failed.', {
        status: 503,
        code: 'E_AWS_CLIENT_VPN_SESSION_LOOKUP_FAILED',
      })
    }
    if (signal?.aborted) throw new Error('Gateway monitoring cancelled')
    if (!result || typeof result !== 'object' || !('Connections' in result) ||
        !Array.isArray(result.Connections) || ('NextToken' in result && result.NextToken != null)) {
      throw invalidConnections()
    }

    const matches: string[] = []
    for (const value of result.Connections as unknown[]) {
      if (!value || typeof value !== 'object') throw invalidConnections()
      const session = value as Record<string, unknown>
      if (session.ClientVpnEndpointId !== endpointId || typeof session.Status !== 'string') {
        throw invalidConnections()
      }
      if (session.Status !== 'active' || session.CommonName !== connectorId) continue
      if (typeof session.ClientIp !== 'string') throw invalidConnections()
      matches.push(session.ClientIp)
    }
    if (matches.length > 1) {
      throw new Exception('AWS reported multiple active VPN sessions for this gateway identity.', {
        status: 503,
        code: 'E_AWS_CLIENT_VPN_SESSION_AMBIGUOUS',
      })
    }
    return matches.length === 1 ? ensureAllowedSshAddress(matches[0]) : null
  }
}
