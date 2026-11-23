import { test } from '@japa/runner'
import Gateway from '#models/gateway'
import GatewaySshService from '#services/gateway_ssh_service'
import env from '#start/env'
import { ensureAllowedSshAddress } from '#services/gateway_ssh_address_policy'
import config from '@adonisjs/core/services/config'
import type { VpnProvider, VpnProviderFactory } from '#services/vpn/types'

test.group('Gateway SSH destination restrictions', (group) => {
  function configureProvider(resolveManagementAddress?: VpnProvider['resolveManagementAddress']) {
    config.set('vpn.providers.session_test', () => ({
      id: 'session_test',
      createGateway: async () => {
        throw new Error('Provisioning is outside this test')
      },
      getProfile: async () => {
        throw new Error('Profiles are outside this test')
      },
      deleteGateway: async () => {},
      updateRoutes: async () => {},
      resolveManagementAddress,
    }) satisfies VpnProvider)
  }

  group.each.setup(() => {
    const previous = env.get('GATEWAY_SSH_ALLOWED_CIDRS')
    const previousProviders = config.get<Record<string, VpnProviderFactory>>('vpn.providers')
    config.set('vpn.providers', { ...previousProviders })
    env.set('GATEWAY_SSH_ALLOWED_CIDRS', '10.42.0.0/24,192.168.11.0/24')
    return () => {
      config.set('vpn.providers', previousProviders)
      env.set('GATEWAY_SSH_ALLOWED_CIDRS', previous)
      if (previous === undefined) delete process.env.GATEWAY_SSH_ALLOWED_CIDRS
    }
  })
  test('accepts only literal addresses inside configured management and LAN subnets', ({
    assert,
  }) => {
    for (const address of ['10.42.0.1', '10.42.0.254', '192.168.11.200']) {
      assert.equal(ensureAllowedSshAddress(address), address)
    }
    for (const address of ['10.42.1.1', '192.168.12.1', '::ffff:127.0.0.1']) {
      assert.throws(() => ensureAllowedSshAddress(address), /not allowed/)
    }
  })

  test('fails closed when the allowlist is invalid', ({ assert }) => {
    for (const value of ['', '10.42.0.0/99', '10.42.0.0/', '10.42.0.0/24/extra', 'localhost/24']) {
      env.set('GATEWAY_SSH_ALLOWED_CIDRS', value)
      assert.throws(() => ensureAllowedSshAddress('10.42.0.1'), /Invalid gateway SSH/)
    }
  })

  test('uses the bound VPN provider to resolve current SSH destinations', async ({ assert }) => {
    const gateway = new Gateway()
    gateway.vpnProvider = 'session_test'
    gateway.vpnResources = { networkId: 'network', connectorId: 'certificate-cn', routeId: 'route' }
    gateway.managementIpAddress = '10.42.0.99'
    gateway.sshHostKeyFingerprint = 'SHA256:test'
    const signal = new AbortController().signal
    const lookups: [string, AbortSignal?][] = []
    const connections: [string, string, AbortSignal?][] = []
    configureProvider(async (connectorId, lookupSignal) => {
      lookups.push([connectorId, lookupSignal])
      return lookups.length === 1 ? '10.42.0.1' : '10.42.0.2'
    })
    const service = new GatewaySshService()
    service.connectToAddress = async (address, fingerprint, connectionSignal) => {
      connections.push([address, fingerprint, connectionSignal])
      throw new Error('SSH stub')
    }

    await assert.rejects(() => service.connect(gateway), /SSH stub/)
    await assert.rejects(() => service.probeStatus(gateway, signal), /SSH stub/)
    assert.deepEqual(lookups, [['certificate-cn', undefined], ['certificate-cn', signal]])
    assert.deepEqual(connections, [
      ['10.42.0.1', 'SHA256:test', undefined],
      ['10.42.0.2', 'SHA256:test', signal],
    ])

    configureProvider()
    await assert.rejects(() => service.connect(gateway), /SSH stub/)
    assert.deepEqual(connections.at(-1), ['10.42.0.99', 'SHA256:test', undefined])
  })

  test('never uses the stored address if the session lookup fails', async ({ assert }) => {
    const gateway = new Gateway()
    gateway.vpnProvider = 'session_test'
    gateway.vpnResources = { networkId: 'network', connectorId: 'certificate-cn', routeId: 'route' }
    gateway.managementIpAddress = '10.42.0.99'
    gateway.sshHostKeyFingerprint = 'SHA256:test'
    const service = new GatewaySshService()
    service.connectToAddress = async () => {
      throw new Error('Unexpected SSH connection')
    }

    configureProvider(async () => null)
    await assert.rejects(() => service.connect(gateway), /no active VPN management address/)
    configureProvider(async () => {
      throw new Error('VPN lookup failed')
    })
    await assert.rejects(() => service.connect(gateway), /VPN lookup failed/)
    configureProvider(async () => '127.0.0.1')
    await assert.rejects(() => service.connect(gateway), /not allowed/)
  })

  for (const address of [
    '127.0.0.1',
    '169.254.169.254',
    '8.8.8.8',
    'localhost',
    '::1',
    '10.42.0.1.evil.test',
  ]) {
    test(`rejects untrusted destination ${address} before reading the private key`, async ({
      assert,
    }) => {
      const service = new GatewaySshService()
      const gateway = new Gateway()
      gateway.managementIpAddress = address
      assert.throws(() => service.ensureConnectionAddress(gateway), /not allowed/)
      await assert.rejects(() => service.connectToAddress(address, 'SHA256:test'), /not allowed/)
    })
  }
})
