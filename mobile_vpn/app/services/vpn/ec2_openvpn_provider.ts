import { execFile } from 'node:child_process'
import { isIP } from 'node:net'
import { isAbsolute } from 'node:path'
import { Exception } from '@adonisjs/core/exceptions'
import env from '#start/env'
import type { VpnProvider, VpnResources } from '#services/vpn/types'

type Action = 'createGateway' | 'getProfile' | 'deleteGateway' | 'updateRoutes'

/**
 * Local provisioner contract: one JSON request on stdin, one JSON response on stdout.
 * It owns certificates, persistent resource IDs, routing and idempotent deletion.
 * The API never runs shell commands or receives the server's private keys.
 */
export default class Ec2OpenvpnProvider implements VpnProvider {
  readonly id = 'ec2_openvpn'
  private readonly provisioner: string

  constructor() {
    const provisioner = env.get('EC2_OPENVPN_PROVISIONER')
    if (!provisioner || !isAbsolute(provisioner)) {
      throw new Exception('An absolute EC2 OpenVPN provisioner path is required.', {
        status: 503,
        code: 'E_VPN_PROVIDER_NOT_CONFIGURED',
      })
    }
    this.provisioner = provisioner
  }

  private failure() {
    return new Exception('EC2 OpenVPN provisioning failed; check the server configuration.', {
      status: 502,
      code: 'E_EC2_OPENVPN_PROVISIONING',
    })
  }

  private resourceId(value: unknown): string {
    if (typeof value !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(value)) {
      throw this.failure()
    }
    return value
  }

  private async request(action: Action, payload: object): Promise<Record<string, unknown>> {
    const output = await new Promise<string>((resolve, reject) => {
      const child = execFile(
        this.provisioner,
        [],
        {
          timeout: 30_000,
          maxBuffer: 1024 * 1024,
          encoding: 'utf8',
          // Do not pass API, database or CloudConnexa credentials to the helper.
          env: { PATH: '/usr/sbin:/usr/bin:/sbin:/bin', LANG: 'C.UTF-8' },
          shell: false,
        },
        (error, stdout) => {
          // Child-process errors may contain stderr or certificate material.
          if (error) reject(this.failure())
          else resolve(stdout)
        }
      )
      child.stdin?.on('error', () => reject(this.failure()))
      child.stdin?.end(JSON.stringify({ version: 1, action, ...payload }) + '\n')
    })
    try {
      const response: unknown = JSON.parse(output)
      if (!response || typeof response !== 'object' || Array.isArray(response)) {
        throw this.failure()
      }
      return response as Record<string, unknown>
    } catch {
      throw this.failure()
    }
  }

  async createGateway(
    name: string,
    managementIp: string,
    onNetworkCreated: (networkId: string) => Promise<void>
  ): Promise<VpnResources> {
    if (!name.trim() || name.length > 255 || isIP(managementIp) !== 4) {
      throw this.failure()
    }
    const response = await this.request('createGateway', { name, managementIp })
    // Persist a known resource ID before validating the rest, allowing cleanup on failure.
    const networkId = this.resourceId(response.networkId)
    await onNetworkCreated(networkId)
    return {
      networkId,
      connectorId: this.resourceId(response.connectorId),
      routeId: this.resourceId(response.routeId),
    }
  }

  async getProfile(connectorId: string) {
    const response = await this.request('getProfile', {
      connectorId: this.resourceId(connectorId),
    })
    if (
      response.format !== 'openvpn' ||
      typeof response.content !== 'string' ||
      !response.content.trim() ||
      response.content.includes('\0')
    ) {
      throw this.failure()
    }
    return { content: response.content, format: 'openvpn' as const }
  }

  async deleteGateway(networkId: string) {
    const response = await this.request('deleteGateway', {
      networkId: this.resourceId(networkId),
    })
    if (response.deleted !== true) throw this.failure()
  }

  async updateRoutes(routeId: string, routes: string[]) {
    if (
      routes.length > 256 ||
      routes.some((route) => {
        const [address, prefix, extra] = route.split('/')
        return (
          extra !== undefined ||
          isIP(address) !== 4 ||
          !/^(?:[0-9]|[12][0-9]|3[0-2])$/.test(prefix ?? '')
        )
      })
    ) {
      throw this.failure()
    }
    const response = await this.request('updateRoutes', {
      routeId: this.resourceId(routeId),
      routes,
    })
    if (response.updated !== true) throw this.failure()
  }
}
