import config from '@adonisjs/core/services/config'
import { Exception } from '@adonisjs/core/exceptions'
import type {
  ConfiguredVpnProvider,
  GatewayVpnBinding,
  ManagedVpnProvider,
  VpnProfileFormat,
  VpnProviderFactory,
  VpnResources,
} from '#services/vpn/types'

export async function resolveVpnProvider(
  id = config.get<string>('vpn.defaultProvider')
): Promise<ConfiguredVpnProvider> {
  const factories = config.get<Record<string, VpnProviderFactory>>('vpn.providers')
  if (!id || !/^[a-z][a-z0-9_-]{0,63}$/.test(id) || !factories || !Object.hasOwn(factories, id)) {
    throw new Exception('VPN provider is not configured.', {
      status: 503,
      code: 'E_VPN_PROVIDER_NOT_CONFIGURED',
    })
  }
  const provider = await factories[id]()
  if (
    !provider ||
    provider.id !== id ||
    !hasValidVpnLifecycle(provider) ||
    (provider.getProfile !== undefined && typeof provider.getProfile !== 'function') ||
    (provider.profileFormats !== undefined &&
      (!provider.getProfile ||
        !Array.isArray(provider.profileFormats) ||
        provider.profileFormats.length === 0 ||
        provider.profileFormats.some((format) => format !== 'openvpn' && format !== 'wireguard'))) ||
    (provider.updateRoutes !== undefined && typeof provider.updateRoutes !== 'function') ||
    (provider.managementAddressMode !== undefined &&
      provider.managementAddressMode !== 'static' &&
      provider.managementAddressMode !== 'session') ||
    (provider.managementAddressMode === 'session' &&
      typeof provider.resolveManagementAddress !== 'function')
  ) {
    throw new Exception('Invalid VPN provider adapter.', {
      status: 503,
      code: 'E_VPN_PROVIDER_INVALID',
    })
  }
  return provider
}

function hasValidVpnLifecycle(provider: ConfiguredVpnProvider) {
  if (provider.lifecycle === 'attached') {
    return (
      typeof provider.attachGateway === 'function' &&
      !('createGateway' in provider) &&
      !('deleteGateway' in provider) &&
      provider.updateRoutes === undefined
    )
  }
  return (
    (provider.lifecycle === undefined || provider.lifecycle === 'managed') &&
    typeof provider.createGateway === 'function' &&
    typeof provider.deleteGateway === 'function'
  )
}

export function requireManagedVpnProvider(provider: ConfiguredVpnProvider): ManagedVpnProvider {
  if (provider.lifecycle === 'attached') {
    throw new Exception('The bound VPN provider only supports attaching preprovisioned gateways.', {
      status: 422,
      code: 'E_VPN_MANAGED_LIFECYCLE_UNSUPPORTED',
    })
  }
  return provider
}

export function requireVpnProfile(provider: ConfiguredVpnProvider, format?: VpnProfileFormat) {
  if (!provider.getProfile || (format && provider.profileFormats && !provider.profileFormats.includes(format))) {
    throw new Exception('The bound VPN provider does not supply the requested VPN profile.', {
      status: 422,
      code: 'E_VPN_PROFILE_UNSUPPORTED',
    })
  }
  return provider.getProfile.bind(provider)
}

export function gatewayVpnResources(gateway: {
  vpnProvider: string
  vpnResources: GatewayVpnBinding | null
  ccNetworkId: string | null
  ccConnectorId: string | null
  ccIpServiceId: string | null
}): GatewayVpnBinding {
  if (gateway.vpnResources) return gateway.vpnResources
  // Legacy CloudConnexa records and integrations retain their existing identifiers.
  if (gateway.vpnProvider === 'cloudconnexa') {
    return {
      ...(gateway.ccNetworkId ? { networkId: gateway.ccNetworkId } : {}),
      ...(gateway.ccConnectorId ? { connectorId: gateway.ccConnectorId } : {}),
      ...(gateway.ccIpServiceId ? { routeId: gateway.ccIpServiceId } : {}),
    }
  }
  return {}
}

export function gatewayVpnAttributes(providerId: string, resources: VpnResources) {
  return {
    vpnProvider: providerId,
    vpnResources: {
      networkId: resources.networkId,
      connectorId: resources.connectorId,
      ...(resources.routeId === undefined ? {} : { routeId: resources.routeId }),
    },
    // Keep legacy API fields populated only for the adapter they describe.
    ccNetworkId: providerId === 'cloudconnexa' ? resources.networkId : null,
    ccConnectorId: providerId === 'cloudconnexa' ? resources.connectorId : null,
    ccIpServiceId: providerId === 'cloudconnexa' ? (resources.routeId ?? null) : null,
  }
}
