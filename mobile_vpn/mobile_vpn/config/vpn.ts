import env from '#start/env'
import type { VpnProviderFactory } from '#services/vpn/types'

export default {
  defaultProvider: env.get('VPN_PROVIDER', 'cloudconnexa'),
  providers: {
    ec2_openvpn: async () => {
      const { default: Ec2OpenvpnProvider } = await import('#services/vpn/ec2_openvpn_provider')
      return new Ec2OpenvpnProvider()
    },
    cloudconnexa: async () => {
      const { default: CloudConnexaProvider } = await import('#services/vpn/cloud_connexa_provider')
      return new CloudConnexaProvider()
    },
  } satisfies Record<string, VpnProviderFactory>,
}
