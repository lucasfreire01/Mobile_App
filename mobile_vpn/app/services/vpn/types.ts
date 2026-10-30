import { Exception } from '@adonisjs/core/exceptions'

export type VpnResources = { networkId: string; connectorId: string; routeId: string }
export type VpnProfile = { content: string; format: 'openvpn' | 'wireguard' }

export interface VpnProvider {
  readonly id: string
  createGateway(
    name: string,
    managementIp: string,
    onNetworkCreated: (networkId: string) => Promise<void>
  ): Promise<VpnResources>
  getProfile(connectorId: string): Promise<VpnProfile>
  deleteGateway(networkId: string): Promise<void>
  updateRoutes(routeId: string, routes: string[]): Promise<void>
}

export type VpnProviderFactory = () => VpnProvider | Promise<VpnProvider>

/** Only explicit, definitive rejections allow releasing an IP before a resource ID is known. */
export class VpnProvisioningRejectedError extends Exception {
  constructor() {
    super('VPN provider rejected provisioning without creating resources.', {
      status: 502,
      code: 'E_VPN_PROVISIONING_REJECTED',
    })
  }
}
