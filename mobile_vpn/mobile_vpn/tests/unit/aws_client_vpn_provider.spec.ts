import { test } from '@japa/runner'
import env from '#start/env'
import AwsClientVpnProvider from '#services/vpn/aws_client_vpn_provider'
import { resolveVpnProvider } from '#services/vpn/registry'

const endpointId = 'cvpn-endpoint-0123456789abcdef0'
const region = 'sa-east-1'
const connectorId = 'browan-canary'
const session = {
  ClientVpnEndpointId: endpointId,
  CommonName: connectorId,
  ClientIp: '10.42.0.20',
  Status: 'active',
}

test.group('AWS Client VPN attachment', (group) => {
  group.each.setup(() => {
    const previous = env.get('GATEWAY_SSH_ALLOWED_CIDRS')
    env.set('GATEWAY_SSH_ALLOWED_CIDRS', '10.42.0.0/24')
    return () => env.set('GATEWAY_SSH_ALLOWED_CIDRS', previous)
  })

  test('resolves one current certificate identity and skips terminated sessions', async ({
    assert,
  }) => {
    const provider = new AwsClientVpnProvider(endpointId, region, async (endpoint) => {
      assert.deepEqual(endpoint, { id: endpointId, region })
      return {
        Connections: [
          { ...session, ClientIp: '10.42.0.1', Status: 'terminated' },
          { ...session, CommonName: `${connectorId}-other` },
          session,
        ],
        NextToken: null,
      }
    })
    assert.deepEqual(await provider.attachGateway(connectorId), { connectorId })
    assert.equal(await provider.resolveManagementAddress(connectorId), session.ClientIp)
    assert.isNull(await provider.resolveManagementAddress('BROWAN-CANARY'))
  })

  test('rejects ambiguity, truncated results and mismatched endpoints', async ({ assert }) => {
    let result: unknown = { Connections: [session, session] }
    const provider = new AwsClientVpnProvider(endpointId, region, async () => result)
    await assert.rejects(() => provider.resolveManagementAddress(connectorId), /multiple active/)
    result = { Connections: [session], NextToken: 'truncated' }
    await assert.rejects(() => provider.resolveManagementAddress(connectorId), /invalid Client VPN/)
    result = { Connections: [{ ...session, ClientVpnEndpointId: 'cvpn-endpoint-123' }] }
    await assert.rejects(() => provider.resolveManagementAddress(connectorId), /invalid Client VPN/)
    result = { Connections: [{ ...session, ClientIp: '127.0.0.1' }] }
    await assert.rejects(() => provider.resolveManagementAddress(connectorId), /not allowed/)
    result = { Connections: [] }
    await assert.rejects(() => provider.attachGateway(connectorId), /No matching AWS/)
  })

  test('fails safely on missing config, aborted requests and AWS CLI failure', async ({ assert }) => {
    const cancel = new AbortController()
    let calls = 0
    const read = async () => {
      calls++
      throw new Error('arbitrary provider output')
    }
    const invalid = new AwsClientVpnProvider('--debug', region, read)
    await assert.rejects(() => invalid.attachGateway(connectorId), /must be configured/)
    cancel.abort()
    const provider = new AwsClientVpnProvider(endpointId, region, read)
    await assert.rejects(() => provider.resolveManagementAddress(connectorId, cancel.signal), /cancelled/)
    assert.equal(calls, 0)
    await assert.rejects(() => provider.attachGateway(connectorId), /^AWS Client VPN session lookup failed\.$/)
    assert.equal(calls, 1)
  })

  test('registers the adapter for existing sessions without managing AWS resources', async ({
    assert,
  }) => {
    const provider = await resolveVpnProvider('aws_client_vpn')
    assert.equal(provider.lifecycle, 'attached')
    assert.equal(provider.managementAddressMode, 'session')
    assert.notProperty(provider, 'createGateway')
    assert.notProperty(provider, 'deleteGateway')
  })
})
