import { test } from '@japa/runner'
import config from '@adonisjs/core/services/config'
import db from '@adonisjs/lucid/services/db'
import Gateway from '#models/gateway'
import User from '#models/user'
import CloudConnexaService from '#services/cloud_connexa_service'
import GatewayProvisioningService from '#services/gateway_provisioning_service'
import { resolveVpnProvider } from '#services/vpn/registry'
import {
  VpnProvisioningRejectedError,
  type VpnProvider,
  type VpnProviderFactory,
} from '#services/vpn/types'

type VpnConfig = { defaultProvider: string; providers: Record<string, VpnProviderFactory> }
type Created = {
  gateway: {
    id: number
    vpnProvider: string
    vpnResources: { networkId: string; connectorId: string; routeId: string }
    ccNetworkId: string | null
  }
}
const created = (response: { body(): unknown }) => (response.body() as Created).gateway

test.group('Pluggable VPN providers', (group) => {
  let original: VpnConfig
  let authorization: string
  let alpha: VpnProvider
  let beta: VpnProvider
  let events: string[]
  let sequence: number

  function provider(id: string): VpnProvider {
    return {
      id,
      async createGateway(_name, _ip, onNetworkCreated) {
        const networkId = `${id}-network-${sequence++}`
        events.push(`${id}:create`)
        await onNetworkCreated(networkId)
        return {
          networkId,
          connectorId: `${networkId}-connector`,
          routeId: `${networkId}-route`,
          privateConfiguration: 'fixture-field-that-must-not-be-stored',
        }
      },
      async getProfile(connectorId) {
        events.push(`${id}:profile:${connectorId}`)
        return { content: '[Interface]\nAddress = 192.0.2.1/32\n', format: 'wireguard' }
      },
      async deleteGateway(networkId) {
        events.push(`${id}:delete:${networkId}`)
      },
      async updateRoutes(routeId, routes) {
        events.push(`${id}:routes:${routeId}:${routes.join(',')}`)
      },
    }
  }

  group.each.setup(async () => {
    original = config.get<VpnConfig>('vpn')
    events = []
    sequence = 1
    alpha = provider('alpha')
    beta = provider('beta')
    config.set('vpn', {
      defaultProvider: 'alpha',
      providers: { ...original.providers, alpha: () => alpha, beta: () => beta },
    })
    await db.from('gateway_ip_reservations').delete()
    await Gateway.query().delete()
    const user = await User.create({
      email: `vpn-${Date.now()}@example.test`,
      password: 'test-password',
      isAdmin: true,
    })
    const token = await User.accessTokens.create(user)
    authorization = `Bearer ${token.value!.release()}`
  })
  group.each.teardown(() => {
    config.set('vpn', original)
  })

  test('switches the default for new gateways while existing profiles and deletion remain pinned', async ({
    client,
    assert,
  }) => {
    const payload = {
      name: 'alpha-gateway',
      managementIpAddress: '10.42.0.81',
      vpnProvider: 'beta',
    }
    const first = await client
      .post('/api/v1/gateways')
      .header('authorization', authorization)
      .json(payload)
    first.assertStatus(201)
    const old = created(first)
    assert.equal(old.vpnProvider, 'alpha')
    assert.isNull(old.ccNetworkId)
    assert.equal(old.vpnResources.routeId, `${old.vpnResources.networkId}-route`)
    assert.notProperty(old.vpnResources, 'privateConfiguration')
    config.set('vpn.defaultProvider', 'beta')
    const second = await client
      .post('/api/v1/gateways')
      .header('authorization', authorization)
      .json({ name: 'beta-gateway', managementIpAddress: '10.42.0.82' })
    second.assertStatus(201)
    assert.equal(created(second).vpnProvider, 'beta')
    const profile = await client
      .get(`/api/v1/gateways/${old.id}/vpn-profile`)
      .header('authorization', authorization)
    profile.assertStatus(200)
    assert.include(profile.text(), '[Interface]')
    profile.assertHeader('content-disposition', `attachment; filename="gateway-${old.id}.conf"`)
    profile.assertHeader('cache-control', 'no-store')
    assert.include(events, `alpha:profile:${old.vpnResources.connectorId}`)
    const deletion = await client
      .delete(`/api/v1/gateways/${old.id}`)
      .header('authorization', authorization)
    deletion.assertStatus(204)
    assert.include(events, `alpha:delete:${old.vpnResources.networkId}`)
    assert.isFalse(
      events.some((event) => event.startsWith('beta:delete:') || event.startsWith('beta:profile:'))
    )
    const saved = await Gateway.findOrFail(created(second).id)
    assert.equal(saved.vpnResources!.networkId, created(second).vpnResources.networkId)
  })

  test('uses the reservation provider for cleanup even after changing the default', async ({
    client,
    assert,
  }) => {
    alpha.createGateway = async (_name, _ip, onCreated) => {
      await onCreated('alpha-partial')
      throw new Error('partial provisioning failure')
    }
    alpha.deleteGateway = async () => {
      throw new Error('cleanup unavailable')
    }
    const response = await client
      .post('/api/v1/gateways')
      .header('authorization', authorization)
      .json({ name: 'partial', managementIpAddress: '10.42.0.83' })
    response.assertStatus(503)
    const reservation = await db.from('gateway_ip_reservations').first()
    assert.equal(reservation.vpn_provider, 'alpha')
    assert.equal(reservation.status, 'cleanup_required')
    config.set('vpn.defaultProvider', 'beta')
    alpha.deleteGateway = async (id) => {
      events.push(`alpha:delete:${id}`)
    }
    assert.isTrue(await new GatewayProvisioningService().retryCleanup(reservation.id))
    assert.include(events, 'alpha:delete:alpha-partial')
    assert.isFalse(events.some((event) => event.startsWith('beta:delete:')))
    assert.isEmpty(await db.from('gateway_ip_reservations'))
  })

  test('preserves ambiguous reservations and releases only definitive provider rejections', async ({
    client,
    assert,
  }) => {
    alpha.createGateway = async () => {
      throw new Error('response lost')
    }
    const uncertain = await client
      .post('/api/v1/gateways')
      .header('authorization', authorization)
      .json({ name: 'uncertain', managementIpAddress: '10.42.0.84' })
    uncertain.assertStatus(503)
    const reservation = await db.from('gateway_ip_reservations').first()
    assert.equal(reservation.vpn_provider, 'alpha')
    assert.equal(reservation.status, 'reconciliation_required')
    alpha.createGateway = async () => {
      throw new VpnProvisioningRejectedError()
    }
    const rejected = await client
      .post('/api/v1/gateways')
      .header('authorization', authorization)
      .json({ name: 'rejected', managementIpAddress: '10.42.0.85' })
    rejected.assertStatus(502)
    const remaining = await db.from('gateway_ip_reservations')
    assert.equal(remaining.length, 1)
    assert.equal(remaining[0].id, reservation.id)
  })

  test('compensates incomplete adapter results instead of saving unusable identifiers', async ({
    client,
    assert,
  }) => {
    alpha.createGateway = async (_name, _ip, onCreated) => {
      await onCreated('alpha-bad')
      return { networkId: 'alpha-bad', connectorId: 'connector', routeId: '' }
    }
    const response = await client
      .post('/api/v1/gateways')
      .header('authorization', authorization)
      .json({ name: 'bad-resources', managementIpAddress: '10.42.0.86' })
    response.assertStatus(502)
    assert.include(events, 'alpha:delete:alpha-bad')
    assert.isEmpty(await Gateway.all())
    assert.isEmpty(await db.from('gateway_ip_reservations'))
  })

  test('fails closed when a bound provider is removed instead of using the new default', async ({
    client,
    assert,
  }) => {
    const response = await client
      .post('/api/v1/gateways')
      .header('authorization', authorization)
      .json({ name: 'bound', managementIpAddress: '10.42.0.87' })
    response.assertStatus(201)
    const saved = created(response)
    config.set('vpn', { defaultProvider: 'beta', providers: { beta: () => beta } })
    const profile = await client
      .get(`/api/v1/gateways/${saved.id}/vpn-profile`)
      .header('authorization', authorization)
    profile.assertStatus(503)
    const deletion = await client
      .delete(`/api/v1/gateways/${saved.id}`)
      .header('authorization', authorization)
    deletion.assertStatus(503)
    assert.isNotNull(await Gateway.find(saved.id))
    assert.isFalse(
      events.some((event) => event.startsWith('beta:delete:') || event.startsWith('beta:profile:'))
    )
  })

  test('keeps legacy CloudConnexa identifiers working when another provider is the default', async ({
    client,
    assert,
  }) => {
    const gateway = await Gateway.create({
      name: 'legacy',
      managementIpAddress: '10.42.0.88',
      ccNetworkId: 'legacy-network',
      ccConnectorId: 'legacy-connector',
      ccIpServiceId: 'legacy-route',
    })
    const getProfile = CloudConnexaService.prototype.getConnectorProfile
    const deleteNetwork = CloudConnexaService.prototype.deleteNetwork
    CloudConnexaService.prototype.getConnectorProfile = async (id) => {
      assert.equal(id, 'legacy-connector')
      return 'client\n'
    }
    CloudConnexaService.prototype.deleteNetwork = async (id) => {
      events.push(`cloudconnexa:delete:${id}`)
    }
    try {
      const profile = await client
        .get(`/api/v1/gateways/${gateway.id}/vpn-profile`)
        .header('authorization', authorization)
      profile.assertStatus(200)
      profile.assertHeader(
        'content-disposition',
        `attachment; filename="gateway-${gateway.id}.ovpn"`
      )
      assert.equal(profile.text(), 'client\n')
      const deletion = await client
        .delete(`/api/v1/gateways/${gateway.id}`)
        .header('authorization', authorization)
      deletion.assertStatus(204)
      assert.include(events, 'cloudconnexa:delete:legacy-network')
      assert.isFalse(
        events.some(
          (event) => event.startsWith('alpha:profile:') || event.startsWith('alpha:delete:')
        )
      )
    } finally {
      CloudConnexaService.prototype.getConnectorProfile = getProfile
      CloudConnexaService.prototype.deleteNetwork = deleteNetwork
    }
  })

  test('validates registry entries and selects an alternative without constructing CloudConnexa', async ({
    assert,
  }) => {
    const check = CloudConnexaService.prototype.ensureConfigured
    CloudConnexaService.prototype.ensureConfigured = () => {
      throw new Error('CloudConnexa must not be required')
    }
    try {
      const selected = await resolveVpnProvider()
      assert.equal(selected.id, 'alpha')
      for (const id of ['missing', '__proto__', 'constructor']) {
        await assert.rejects(() => resolveVpnProvider(id), /VPN provider is not configured/)
      }
      config.set('vpn.providers.wrong', () => ({ ...beta }))
      await assert.rejects(() => resolveVpnProvider('wrong'), /Invalid VPN provider adapter/)
    } finally {
      CloudConnexaService.prototype.ensureConfigured = check
    }
  })
})
