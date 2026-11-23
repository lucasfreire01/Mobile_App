import { test } from '@japa/runner'
import env from '#start/env'
import AzureVpnGatewayP2sProvider from '#services/vpn/azure_vpn_gateway_p2s_provider'
import { resolveVpnProvider } from '#services/vpn/registry'

const resourceId =
  '/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/lab/providers/Microsoft.Network/virtualNetworkGateways/p2s'
const connectorId = 'browan-canary'
const session = {
  vpnConnectionId: 'OVPN_test-session',
  vpnUserName: connectorId,
  privateIpAddress: '10.42.0.20',
}

test.group('Azure VPN Gateway P2S attachment', (group) => {
  group.each.setup(() => {
    const previous = env.get('GATEWAY_SSH_ALLOWED_CIDRS')
    env.set('GATEWAY_SSH_ALLOWED_CIDRS', '10.42.0.0/24')
    return () => {
      env.set('GATEWAY_SSH_ALLOWED_CIDRS', previous)
      if (previous === undefined) delete process.env.GATEWAY_SSH_ALLOWED_CIDRS
    }
  })

  test('attaches by exact OpenVPN identity and resolves the current session separately', async ({
    assert,
  }) => {
    const cancel = new AbortController()
    let queries = 0
    const provider = new AzureVpnGatewayP2sProvider(resourceId, {
      async readHealth(id, signal) {
        assert.equal(id, resourceId)
        assert.equal(signal, queries === 0 ? undefined : cancel.signal)
        queries++
        return {
          value: [
            { ...session, vpnUserName: 'browan-canary-other' },
            { ...session, vpnConnectionId: 'IKEv2_not-openvpn' },
            { ...session, privateIpAddress: `10.42.0.${20 + queries}` },
          ],
        }
      },
    })

    assert.deepEqual(await provider.attachGateway(connectorId), { connectorId })
    assert.equal(await provider.resolveManagementAddress(connectorId, cancel.signal), '10.42.0.22')
    assert.equal(queries, 2)
  })

  test('rejects absent, ambiguous, malformed and disallowed sessions', async ({ assert }) => {
    let result: unknown = { value: [] }
    const provider = new AzureVpnGatewayP2sProvider(resourceId, { readHealth: async () => result })
    assert.isNull(await provider.resolveManagementAddress(connectorId))
    await assert.rejects(() => provider.attachGateway(connectorId), /No matching Azure OpenVPN/)

    result = { value: [session, session] }
    await assert.rejects(() => provider.resolveManagementAddress(connectorId), /multiple OpenVPN/)
    result = { value: [{ ...session, privateIpAddress: false }] }
    await assert.rejects(() => provider.resolveManagementAddress(connectorId), /invalid VPN session/)
    result = { value: [{ ...session, privateIpAddress: '127.0.0.1' }] }
    await assert.rejects(() => provider.resolveManagementAddress(connectorId), /not allowed/)
  })

  test('requires a resource ID before querying and sanitizes errors from the CLI', async ({
    assert,
  }) => {
    let queries = 0
    const readHealth = async () => {
      queries++
      throw new Error('sensitive CLI error')
    }
    for (const invalidResourceId of [undefined, '--subscription other-tenant']) {
      const invalid = new AzureVpnGatewayP2sProvider(invalidResourceId, { readHealth })
      await assert.rejects(() => invalid.attachGateway(connectorId), /not configured or is invalid/)
    }
    assert.equal(queries, 0)
    const provider = new AzureVpnGatewayP2sProvider(resourceId, { readHealth })
    await assert.rejects(() => provider.resolveManagementAddress(connectorId), /^Azure VPN session lookup failed\.$/)
    assert.equal(queries, 1)
  })

  test('rejects a lookup cancelled while reading connection health', async ({ assert }) => {
    const cancel = new AbortController()
    const provider = new AzureVpnGatewayP2sProvider(resourceId, {
      async readHealth(_, signal) {
        assert.equal(signal, cancel.signal)
        cancel.abort()
        return { value: [session] }
      },
    })
    await assert.rejects(() => provider.resolveManagementAddress(connectorId, cancel.signal), /cancelled/)
  })

  test('bounds the configurable timeout while allowing longer Azure operations', ({ assert }) => {
    for (const timeoutMs of [0, 1_000.5, 60_001]) {
      assert.throws(() => new AzureVpnGatewayP2sProvider(resourceId, { timeoutMs }), /timeout is invalid/)
    }
    assert.doesNotThrow(() => new AzureVpnGatewayP2sProvider(resourceId, { timeoutMs: 30_000 }))
  })

  test('registers the Azure adapter as external and session-addressed', async ({ assert }) => {
    const provider = await resolveVpnProvider('azure_vpn_gateway_p2s')
    assert.equal(provider.lifecycle, 'attached')
    assert.equal(provider.managementAddressMode, 'session')
    assert.notProperty(provider, 'createGateway')
    assert.notProperty(provider, 'deleteGateway')
    assert.notProperty(provider, 'getProfile')
  })
})
