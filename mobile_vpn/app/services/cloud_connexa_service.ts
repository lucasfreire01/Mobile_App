import env from '#start/env'
import { Exception } from '@adonisjs/core/exceptions'

type TokenCache = { value: string; expiresAt: number }

export type GatewayVpnResources = {
  networkId: string
  connectorId: string
  ipServiceId: string
}

export default class CloudConnexaService {
  // Shared across instances: token is valid for ~12h
  private static token: TokenCache | null = null

  ensureConfigured() {
    if (
      !env.get('CLOUDCONNEXA_BASE_URL') ||
      !env.get('CLOUDCONNEXA_CLIENT_ID') ||
      !env.get('CLOUDCONNEXA_CLIENT_SECRET')
    ) {
      throw new Exception('CloudConnexa provider credentials are not configured.', {
        status: 503,
        code: 'E_VPN_PROVIDER_NOT_CONFIGURED',
      })
    }
  }

  private get baseUrl() {
    this.ensureConfigured()
    return env.get('CLOUDCONNEXA_BASE_URL')!.replace(/\/$/, '')
  }

  private async getToken(): Promise<string> {
    const cached = CloudConnexaService.token
    if (cached && cached.expiresAt > Date.now() + 60_000) return cached.value

    const basic = Buffer.from(
      `${env.get('CLOUDCONNEXA_CLIENT_ID')}:${env.get('CLOUDCONNEXA_CLIENT_SECRET')!.release()}`
    ).toString('base64')

    const res = await fetch(`${this.baseUrl}/api/v1/oauth/token?grant_type=client_credentials`, {
      signal: AbortSignal.timeout(10_000),
      method: 'POST',
      headers: { Authorization: `Basic ${basic}` },
    })
    if (!res.ok) throw this.error('CloudConnexa authentication failed', res.status)

    const data = (await res.json()) as { access_token: string; expires_in: number }
    CloudConnexaService.token = {
      value: data.access_token,
      expiresAt: Date.now() + data.expires_in * 1000,
    }
    return data.access_token
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    asText = false
  ): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      signal: AbortSignal.timeout(10_000),
      method,
      headers: {
        Authorization: `Bearer ${await this.getToken()}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    })

    if (method === 'DELETE' && res.status === 404) return undefined as T
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      throw this.error(`CloudConnexa ${method} ${path} failed: ${detail.slice(0, 300)}`, res.status)
    }
    if (res.status === 204) return undefined as T
    return (asText ? await res.text() : await res.json()) as T
  }

  private error(message: string, upstreamStatus: number) {
    return new Exception(message, { status: 502, code: `E_CLOUDCONNEXA_${upstreamStatus}` })
  }

  /**
   * Creates Network + Connector + IP Service and grants access to the backend.
   * Rolls back (deletes the Network) if any step fails.
   */
  async createGatewayResources(
    name: string,
    managementIp: string,
    onNetworkCreated?: (networkId: string) => Promise<void>
  ): Promise<GatewayVpnResources> {
    const network = await this.request<{ id: string; connectors: { id: string }[] }>(
      'POST',
      '/api/v1/networks',
      {
        name,
        description: `Gateway ${name} (mobile_vpn)`,
        internetAccess: 'SPLIT_TUNNEL_ON',
        egress: false,
        tunnelingProtocol: 'OPENVPN',
        connectors: [
          { name: `${name}-connector`, vpnRegionId: env.get('CLOUDCONNEXA_REGION', 'br-gru') },
        ],
      }
    )

    try {
      await onNetworkCreated?.(network.id)
      const ipService = await this.request<{ id: string }>(
        'POST',
        `/api/v1/networks/ip-services?networkId=${network.id}`,
        {
          name: `${name}-ssh`,
          type: 'SERVICE_DESTINATION',
          routes: [{ value: `${managementIp}/32` }],
          config: { serviceTypes: ['SSH'] },
        }
      )

      const accessGroupId = env.get('CLOUDCONNEXA_ACCESS_GROUP_ID')
      if (accessGroupId) {
        await this.request('POST', `/api/v1/access-groups/${accessGroupId}/destination`, {
          type: 'NETWORK_SERVICE',
          parent: network.id,
          allCovered: true,
        })
      }

      return {
        networkId: network.id,
        connectorId: network.connectors[0].id,
        ipServiceId: ipService.id,
      }
    } catch (err) {
      if (!onNetworkCreated) await this.deleteNetwork(network.id)
      throw err
    }
  }

  /** Returns the .ovpn profile content for the connector. */
  async getConnectorProfile(connectorId: string): Promise<string> {
    return this.request<string>(
      'POST',
      `/api/v1/networks/connectors/${connectorId}/profile`,
      undefined,
      true
    )
  }

  /** Deletes the Network (and its connectors / IP services). */
  async deleteNetwork(networkId: string): Promise<void> {
    await this.request('DELETE', `/api/v1/networks/${networkId}`)
  }

  /**
   * Updates the routes of an existing IP service.
   * Cloud Connexa expects an array of route objects with a `value` field.
   * This method replaces the current routes with the provided list.
   */
  async updateIpServiceRoutes(ipServiceId: string, routes: string[]): Promise<void> {
    const body = {
      routes: routes.map((r) => ({ value: r })),
    }
    await this.request('PATCH', `/api/v1/networks/ip-services/${ipServiceId}`, body)
  }
}
