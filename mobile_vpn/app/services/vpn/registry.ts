import config from '@adonisjs/core/services/config'
import { Exception } from '@adonisjs/core/exceptions'
import type { VpnProvider, VpnProviderFactory, VpnResources } from '#services/vpn/types'

export async function resolveVpnProvider(
  id = config.get<string>('vpn.defaultProvider')
): Promise<VpnProvider> {
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
    !['createGateway', 'getProfile', 'deleteGateway', 'updateRoutes'].every(
      (method) => typeof provider[method as keyof VpnProvider] === 'function'
    )
  ) {
    throw new Exception('Invalid VPN provider adapter.', {
      status: 503,
      code: 'E_VPN_PROVIDER_INVALID',
    })
  }
  return provider
}

export function gatewayVpnResources(gateway: {
  vpnProvider: string
  vpnResources: Partial<VpnResources> | null
  ccNetworkId: string | null
  ccConnectorId: string | null
  ccIpServiceId: string | null
}): Partial<VpnResources> {
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
      routeId: resources.routeId,
    },
    // Keep legacy API fields populated only for the adapter they describe.
    ccNetworkId: providerId === 'cloudconnexa' ? resources.networkId : null,
    ccConnectorId: providerId === 'cloudconnexa' ? resources.connectorId : null,
    ccIpServiceId: providerId === 'cloudconnexa' ? resources.routeId : null,
  }
}
