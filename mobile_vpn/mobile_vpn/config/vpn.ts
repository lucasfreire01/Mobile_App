import env from '#start/env'
import type { VpnProviderFactory } from '#services/vpn/types'

export default {
  defaultProvider: env.get('VPN_PROVIDER', 'cloudconnexa'),
  providers: {
    google_cloud_vpn: async () => {
      const { googleCloudVpnProvider } = await import('#services/vpn/site_to_site_vpn_providers')
      return googleCloudVpnProvider({
        project: env.get('GOOGLE_CLOUD_VPN_PROJECT'),
        region: env.get('GOOGLE_CLOUD_VPN_REGION'),
        tunnel: env.get('GOOGLE_CLOUD_VPN_TUNNEL'),
      })
    },
    oci_site_to_site_vpn: async () => {
      const { ociSiteToSiteVpnProvider } = await import('#services/vpn/site_to_site_vpn_providers')
      return ociSiteToSiteVpnProvider({
        region: env.get('OCI_VPN_REGION'),
        connectionId: env.get('OCI_VPN_CONNECTION_ID'),
        tunnelId: env.get('OCI_VPN_TUNNEL_ID'),
      })
    },
    aws_client_vpn: async () => {
      const { default: AwsClientVpnProvider } = await import('#services/vpn/aws_client_vpn_provider')
      return new AwsClientVpnProvider(
        env.get('AWS_CLIENT_VPN_ENDPOINT_ID'),
        env.get('AWS_CLIENT_VPN_REGION')
      )
    },
    aws_client_vpn_managed: async () => {
      const { default: AwsManagedClientVpnProvider } =
        await import('#services/vpn/aws_managed_client_vpn_provider')
      return new AwsManagedClientVpnProvider()
    },
    azure_vpn_gateway_p2s: async () => {
      const { default: AzureVpnGatewayP2sProvider } =
        await import('#services/vpn/azure_vpn_gateway_p2s_provider')
      return new AzureVpnGatewayP2sProvider(env.get('AZURE_P2S_VPN_GATEWAY_RESOURCE_ID'), {
        timeoutMs: env.get('AZURE_P2S_VPN_LOOKUP_TIMEOUT_MS'),
      })
    },
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
