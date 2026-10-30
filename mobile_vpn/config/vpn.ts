import env from '#start/env'
import type { VpnProviderFactory } from '#services/vpn/types'

export default {
  defaultProvider: env.get('VPN_PROVIDER', 'cloudconnexa'),
  providers: {
    cloudconnexa: async () => {
      const { default: CloudConnexaProvider } = await import('#services/vpn/cloud_connexa_provider')
      return new CloudConnexaProvider()
    },
  } satisfies Record<string, VpnProviderFactory>,
}
