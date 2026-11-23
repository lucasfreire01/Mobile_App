import { Exception } from '@adonisjs/core/exceptions'

/** Opaque identifiers scoped to the bound provider. */
export type VpnResources = { networkId: string; connectorId: string; routeId?: string }
export type AttachedVpnResources = Omit<VpnResources, 'networkId'> & { networkId?: never }
export type GatewayVpnBinding =
  | (Partial<VpnResources> & { ownership?: 'managed' })
  | (AttachedVpnResources & { ownership: 'attached' })
export type VpnProfileFormat = 'openvpn' | 'wireguard'
export type VpnProfile = { content: string; format: VpnProfileFormat }

interface VpnProviderOperations {
  readonly id: string
  readonly profileFormats?: readonly VpnProfileFormat[]
  getProfile?(connectorId: string, format?: VpnProfileFormat): Promise<VpnProfile>
  resolveManagementAddress?(connectorId: string, signal?: AbortSignal): Promise<string | null>
}

interface ManagedVpnLifecycle {
  readonly lifecycle?: 'managed'
  deleteGateway(networkId: string, options?: { allowMissing?: boolean }): Promise<void>
  updateRoutes?(routeId: string, routes: string[]): Promise<void>
}

type RecordCreatedGateway = (networkId: string) => Promise<void>

export interface VpnProvider extends VpnProviderOperations, ManagedVpnLifecycle {
  readonly managementAddressMode?: 'static'
  createGateway(
    name: string,
    managementIp: string,
    onNetworkCreated: RecordCreatedGateway
  ): Promise<VpnResources>
}

export interface SessionAddressVpnProvider extends VpnProviderOperations, ManagedVpnLifecycle {
  readonly managementAddressMode: 'session'
  createGateway(
    name: string,
    managementIp: null,
    onNetworkCreated: RecordCreatedGateway
  ): Promise<VpnResources>
  resolveManagementAddress(connectorId: string, signal?: AbortSignal): Promise<string | null>
}

export interface AttachedVpnProvider extends VpnProviderOperations {
  readonly lifecycle: 'attached'
  readonly managementAddressMode?: 'static' | 'session'
  readonly updateRoutes?: never
  /** Resolve and validate an existing gateway reference without changing provider resources. */
  attachGateway(reference: string): Promise<AttachedVpnResources>
}

export type ManagedVpnProvider = VpnProvider | SessionAddressVpnProvider
export type ConfiguredVpnProvider = ManagedVpnProvider | AttachedVpnProvider
export type VpnProviderFactory = () => ConfiguredVpnProvider | Promise<ConfiguredVpnProvider>

/** Only explicit, definitive rejections allow releasing an IP before a resource ID is known. */
export class VpnProvisioningRejectedError extends Exception {
  constructor(details?: { method?: string; path?: string; status?: number }) {
    const context = details?.method && details.path && details.status
      ? ` CloudConnexa ${details.method} ${details.path} returned HTTP ${details.status}.`
      : ''
    super(`VPN provider rejected provisioning without creating resources.${context}`, {
      status: 502,
      code: 'E_VPN_PROVISIONING_REJECTED',
    })
  }
}
