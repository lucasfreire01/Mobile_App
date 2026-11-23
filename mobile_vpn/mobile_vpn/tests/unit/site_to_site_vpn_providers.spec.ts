import { test } from '@japa/runner'
import { resolveVpnProvider } from '#services/vpn/registry'
import { googleCloudVpnProvider, ociSiteToSiteVpnProvider } from '#services/vpn/site_to_site_vpn_providers'

const google = { project: 'saganexus-lab', region: 'southamerica-east1', tunnel: 'browan-lab' }
const oci = {
  region: 'sa-saopaulo-1',
  connectionId: 'ocid1.ipsecconnection.oc1.sa-saopaulo-1.aaaaaaaa',
  tunnelId: 'ocid1.ipsectunnel.oc1.sa-saopaulo-1.bbbbbbbb',
}

test.group('Site-to-site VPN attachment', () => {
  test('validates a fixed Google tunnel and accepts independent gateway references', async ({
    assert,
  }) => {
    const provider = googleCloudVpnProvider(google, async (command, args) => {
      assert.equal(command, 'gcloud')
      assert.deepEqual(args, [
        'compute', 'vpn-tunnels', 'describe', google.tunnel,
        '--project', google.project, '--region', google.region,
        '--quiet', '--format', 'json(name,status)',
      ])
      return { name: google.tunnel, status: 'ESTABLISHED' }
    })
    for (const connectorId of ['browan-first', 'browan-peer']) {
      assert.deepEqual(await provider.attachGateway(connectorId), { connectorId })
    }
  })

  test('validates a fixed Oracle IPSec tunnel without requesting its shared secret', async ({
    assert,
  }) => {
    const provider = ociSiteToSiteVpnProvider(oci, async (command, args) => {
      assert.equal(command, 'oci')
      assert.deepEqual(args, [
        '--region', oci.region, 'network', 'ip-sec-tunnel', 'get',
        '--ipsc-id', oci.connectionId, '--tunnel-id', oci.tunnelId,
        '--output', 'json', '--query', 'data.{id:id,status:status}',
      ])
      return { id: oci.tunnelId, status: 'UP' }
    })
    assert.deepEqual(await provider.attachGateway('browan-edge'), { connectorId: 'browan-edge' })
  })

  test('fails safely on down tunnels, mismatched responses and CLI errors', async ({ assert }) => {
    let result: unknown = { name: google.tunnel, status: 'AUTHORIZATION_ERROR' }
    const provider = googleCloudVpnProvider(google, async () => result)
    await assert.rejects(() => provider.attachGateway('edge'), /tunnel is not established/)
    result = { name: 'different-tunnel', status: 'ESTABLISHED' }
    await assert.rejects(() => provider.attachGateway('edge'), /invalid tunnel data/)
    const oracle = ociSiteToSiteVpnProvider(oci, async () => {
      throw new Error('opaque CLI diagnostic')
    })
    await assert.rejects(() => oracle.attachGateway('edge'), /^OCI Site-to-Site VPN tunnel lookup failed\.$/)
  })

  test('rejects invalid configuration and references before an external query', async ({
    assert,
  }) => {
    let calls = 0
    const read = async () => calls++
    const invalid = [
      googleCloudVpnProvider({ ...google, project: '--format' }, read),
      ociSiteToSiteVpnProvider({ ...oci, tunnelId: '' }, read),
    ]
    for (const provider of invalid) {
      await assert.rejects(() => provider.attachGateway('edge'), /configuration is missing or invalid/)
    }
    await assert.rejects(
      () => ociSiteToSiteVpnProvider(oci, read).attachGateway('--tunnel-id'),
      /reference is invalid/
    )
    assert.equal(calls, 0)
  })

  test('registers both providers in attach-only mode with a static address', async ({ assert }) => {
    for (const id of ['google_cloud_vpn', 'oci_site_to_site_vpn']) {
      const provider = await resolveVpnProvider(id)
      assert.equal(provider.lifecycle, 'attached')
      assert.equal(provider.managementAddressMode, 'static')
      assert.notProperty(provider, 'createGateway')
      assert.notProperty(provider, 'getProfile')
      assert.notProperty(provider, 'deleteGateway')
    }
  })
})
