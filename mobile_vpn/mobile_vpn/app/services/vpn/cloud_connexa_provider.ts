import CloudConnexaService from '#services/cloud_connexa_service'
import { VpnProvisioningRejectedError, type VpnProvider } from '#services/vpn/types'

export default class CloudConnexaProvider implements VpnProvider {
  readonly id = 'cloudconnexa'

  constructor(private client = new CloudConnexaService()) {
    this.client.ensureConfigured()
  }

  async createGateway(
    name: string,
    managementIp: string,
    onNetworkCreated: (networkId: string) => Promise<void>
  ) {
    try {
      const resources = await this.client.createGatewayResources(
        name,
        managementIp,
        onNetworkCreated
      )
      return {
        networkId: resources.networkId,
        connectorId: resources.connectorId,
        routeId: resources.ipServiceId,
      }
    } catch (error) {
      const cause = error as {
        code?: string
        upstreamMethod?: string
        upstreamPath?: string
        upstreamStatus?: number
      }
      const code = cause?.code ?? ''
      if (/^E_CLOUDCONNEXA_4\d\d$/.test(code) && code !== 'E_CLOUDCONNEXA_408') {
        throw new VpnProvisioningRejectedError(
          cause.upstreamMethod && cause.upstreamPath && cause.upstreamStatus
            ? { method: cause.upstreamMethod, path: cause.upstreamPath, status: cause.upstreamStatus }
          : undefined)
      }
      throw error
    }
  }

  async getProfile(connectorId: string) {
    const content = await this.client.getConnectorProfile(connectorId)
    // Return traffic to CloudConnexa clients must use the VPN, not the Ethernet default route.
    const returnRoute = 'route 100.96.0.0 255.224.0.0 vpn_gateway'
    return {
      content: content.includes(returnRoute) ? content : `${content.trimEnd()}\n${returnRoute}\n`,
      format: 'openvpn' as const,
    }
  }

  async deleteGateway(networkId: string) {
    await this.client.deleteNetwork(networkId)
  }

  async updateRoutes(routeId: string, routes: string[]) {
    await this.client.updateIpServiceRoutes(routeId, routes)
  }
}
