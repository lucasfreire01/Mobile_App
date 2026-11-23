import { Exception } from '@adonisjs/core/exceptions'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { AttachedVpnProvider } from '#services/vpn/types'

const run = promisify(execFile)
const googleProjectPattern = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/
const googleTunnelPattern = /^[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/
const googleRegionPattern = /^[a-z]{2,}(?:-[a-z0-9]+)+[0-9]$/
const ociRegionPattern = /^[a-z]{2,}(?:-[a-z0-9]+)+-[0-9]+$/
const ociConnectionPattern = /^ocid1\.ipsecconnection\.[a-z0-9-]+\.[a-z0-9-]*\.[a-z0-9]+$/
const ociTunnelPattern = /^ocid1\.ipsectunnel\.[a-z0-9-]+\.[a-z0-9-]*\.[a-z0-9]+$/

type ReadTunnel = (command: string, args: string[]) => Promise<unknown>
type TunnelCheck = { command: string; args: string[]; identity: string; field: 'name' | 'id'; up: string }

const readTunnel: ReadTunnel = async (command, args) => {
  const { stdout } = await run(command, args, { timeout: 10_000, maxBuffer: 64 * 1024 })
  return JSON.parse(stdout)
}

function siteToSiteProvider(
  id: string,
  label: string,
  check: TunnelCheck | null,
  read: ReadTunnel
): AttachedVpnProvider {
  return {
    id,
    lifecycle: 'attached',
    managementAddressMode: 'static',
    async attachGateway(reference) {
      if (!check) {
        throw new Exception(`${label} tunnel configuration is missing or invalid.`, {
          status: 503,
          code: 'E_VPN_PROVIDER_NOT_CONFIGURED',
        })
      }
      if (!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(reference)) {
        throw new Exception('The external VPN gateway reference is invalid.', {
          status: 422,
          code: 'E_VPN_ATTACHMENT_REFERENCE_INVALID',
        })
      }
      let result: unknown
      try {
        result = await read(check.command, check.args)
      } catch {
        throw new Exception(`${label} tunnel lookup failed.`, {
          status: 503,
          code: 'E_VPN_TUNNEL_LOOKUP_FAILED',
        })
      }
      if (!result || typeof result !== 'object') {
        throw new Exception(`${label} returned invalid tunnel data.`, {
          status: 502,
          code: 'E_VPN_TUNNEL_RESPONSE_INVALID',
        })
      }
      const data = result as Record<string, unknown>
      if (data[check.field] !== check.identity || typeof data.status !== 'string') {
        throw new Exception(`${label} returned invalid tunnel data.`, {
          status: 502,
          code: 'E_VPN_TUNNEL_RESPONSE_INVALID',
        })
      }
      if (data.status !== check.up) {
        throw new Exception(`${label} tunnel is not established.`, {
          status: 422,
          code: 'E_VPN_TUNNEL_NOT_ESTABLISHED',
        })
      }
      // The tunnel is shared. The reference identifies the device behind it in SagaNexus.
      return { connectorId: reference }
    },
  }
}

export function googleCloudVpnProvider(
  { project, region, tunnel }: { project?: string; region?: string; tunnel?: string },
  read: ReadTunnel = readTunnel
) {
  const check =
    project && googleProjectPattern.test(project) && region && googleRegionPattern.test(region) &&
    tunnel && googleTunnelPattern.test(tunnel)
      ? {
          command: 'gcloud',
          args: [
            'compute', 'vpn-tunnels', 'describe', tunnel,
            '--project', project, '--region', region, '--quiet', '--format', 'json(name,status)',
          ],
          identity: tunnel,
          field: 'name' as const,
          up: 'ESTABLISHED',
        }
      : null
  return siteToSiteProvider('google_cloud_vpn', 'Google Cloud VPN', check, read)
}

export function ociSiteToSiteVpnProvider(
  { region, connectionId, tunnelId }: { region?: string; connectionId?: string; tunnelId?: string },
  read: ReadTunnel = readTunnel
) {
  const check =
    region && ociRegionPattern.test(region) && connectionId && ociConnectionPattern.test(connectionId) &&
    tunnelId && ociTunnelPattern.test(tunnelId)
      ? {
          command: 'oci',
          args: [
            '--region', region, 'network', 'ip-sec-tunnel', 'get',
            '--ipsc-id', connectionId, '--tunnel-id', tunnelId,
            '--output', 'json', '--query', 'data.{id:id,status:status}',
          ],
          identity: tunnelId,
          field: 'id' as const,
          up: 'UP',
        }
      : null
  return siteToSiteProvider('oci_site_to_site_vpn', 'OCI Site-to-Site VPN', check, read)
}
