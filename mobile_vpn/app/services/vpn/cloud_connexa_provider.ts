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
      const code = (error as { code?: string })?.code ?? ''
      if (/^E_CLOUDCONNEXA_4\d\d$/.test(code) && code !== 'E_CLOUDCONNEXA_408') {
        throw new VpnProvisioningRejectedError()
      }
      throw error
    }
  }

  async getProfile(connectorId: string) {
    return {
      content: await this.client.getConnectorProfile(connectorId),
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
