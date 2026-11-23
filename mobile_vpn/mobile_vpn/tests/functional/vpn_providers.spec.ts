import { test } from '@japa/runner'
import config from '@adonisjs/core/services/config'
import db from '@adonisjs/lucid/services/db'
import limiter from '@adonisjs/limiter/services/main'
import { Exception } from '@adonisjs/core/exceptions'
import Gateway from '#models/gateway'
import User from '#models/user'
import CloudConnexaService from '#services/cloud_connexa_service'
import GatewayProvisioningService from '#services/gateway_provisioning_service'
import { resolveVpnProvider } from '#services/vpn/registry'
import {
  VpnProvisioningRejectedError,
  type AttachedVpnProvider,
  type SessionAddressVpnProvider,
  type VpnProfileFormat,
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
    await limiter.clear(['memory'])
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
    const old = await Gateway.findOrFail(created(first).id)
    if (!old.vpnResources?.networkId || !old.vpnResources.connectorId) throw new Error('VPN resources missing')
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
    const secondGateway = await Gateway.findOrFail(created(second).id)
    assert.equal(secondGateway.vpnProvider, 'beta')
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
    assert.equal(saved.vpnResources!.networkId, secondGateway.vpnResources!.networkId)
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

  test('provisions a gateway without a route ID for an adapter that cannot update routes', async ({
    assert,
  }) => {
    const provider: VpnProvider = {
      ...alpha,
      updateRoutes: undefined,
      async createGateway(_name, _address, onCreated) {
        await onCreated('network-without-route')
        return { networkId: 'network-without-route', connectorId: 'independent-connector' }
      },
    }

    const { gateway, enrollmentCode } = await new GatewayProvisioningService(
      provider
    ).createWithEnrollmentCode({ name: 'without-per-gateway-route', managementIpAddress: '10.42.0.86' })
    await gateway.refresh()
    assert.deepEqual(gateway.vpnResources, {
      networkId: 'network-without-route',
      connectorId: 'independent-connector',
    })
    assert.equal(gateway.managementIpAddress, '10.42.0.86')
    assert.match(enrollmentCode, /^[A-Za-z0-9_-]{43}$/)
    assert.isEmpty(await db.from('gateway_ip_reservations'))
  })

  for (const format of ['external', 'wireguard'] as const) {
    test(`keeps ${format} profiles out of the OpenVPN enrollment flow`, async ({
      client,
      assert,
    }) => {
      const provider: VpnProvider = {
        ...alpha,
        id: 'external_profile',
        profileFormats: format === 'wireguard' ? ['wireguard'] : undefined,
        getProfile: format === 'wireguard' ? alpha.getProfile : undefined,
      }
      config.set('vpn.providers.external_profile', () => provider)
      config.set('vpn.defaultProvider', 'external_profile')
      const service = new GatewayProvisioningService()
      const gateway = await service.create({
        name: 'externally-configured-device',
        managementIpAddress: '10.42.0.87',
      })

      const profile = await client
        .get(`/api/v1/gateways/${gateway.id}/vpn-profile`)
        .header('authorization', authorization)
      profile.assertStatus(format === 'wireguard' ? 200 : 422)
      if (format === 'wireguard') assert.include(profile.text(), '[Interface]')

      const creation = await client
        .post('/api/v1/gateways')
        .header('authorization', authorization)
        .json({ name: 'requires-openvpn', managementIpAddress: '10.42.0.88' })
      creation.assertStatus(422)
      await assert.rejects(
        () => service.renewEnrollment(gateway.id),
        /does not supply the requested VPN profile/
      )
      assert.lengthOf(await Gateway.all(), 1)
      assert.isEmpty(await db.from('gateway_enrollments'))
      assert.isEmpty(await db.from('gateway_ip_reservations'))
    })
  }

  test('validates the download format against the provider even when a profile is cached', async ({
    client,
    assert,
  }) => {
    let advertisedFormats: VpnProfileFormat[] = ['openvpn']
    const provider: VpnProvider = {
      ...alpha,
      id: 'advertised_profile',
      get profileFormats() {
        return advertisedFormats
      },
    }
    config.set('vpn.providers.advertised_profile', () => provider)
    config.set('vpn.defaultProvider', 'advertised_profile')
    const gateway = await new GatewayProvisioningService().create({
      name: 'advertised-profile-formats',
      managementIpAddress: '10.42.0.87',
    })
    const download = () =>
      client.get(`/api/v1/gateways/${gateway.id}/vpn-profile`).header('authorization', authorization)

    const invalidProfile = await download()
    invalidProfile.assertStatus(502)
    assert.notInclude(invalidProfile.text(), '[Interface]')
    advertisedFormats = ['openvpn', 'wireguard']
    const allowedProfile = await download()
    allowedProfile.assertStatus(200)
    assert.include(allowedProfile.text(), '[Interface]')
    advertisedFormats = ['openvpn']
    const deniedCachedProfile = await download()
    deniedCachedProfile.assertStatus(502)
    assert.notInclude(deniedCachedProfile.text(), '[Interface]')
    assert.lengthOf(events.filter((event) => event.startsWith('alpha:profile:')), 2)
  })

  test('provisions session-addressed gateways without allocating a static IP', async ({ assert }) => {
    const provider: SessionAddressVpnProvider = {
      ...alpha,
      id: 'session_test',
      managementAddressMode: 'session',
      updateRoutes: undefined,
      resolveManagementAddress: async () => null,
      async createGateway(_name, address, onCreated) {
        assert.isNull(address)
        const networkId = `session-resource-${sequence++}`
        await onCreated(networkId)
        const reservation = await db
          .from('gateway_ip_reservations')
          .where('network_id', networkId)
          .firstOrFail()
        assert.isNull(reservation.management_ip_address)
        assert.isString(reservation.gateway_name_key)
        return { networkId, connectorId: `identity-${networkId}` }
      },
    }
    config.set('vpn.providers.session_test', () => provider)
    config.set('vpn.defaultProvider', 'session_test')
    const service = new GatewayProvisioningService()
    await assert.rejects(
      () =>
        service.createWithEnrollmentCode({
          name: 'session-static',
          managementIpAddress: '10.42.0.84',
        }),
      /assigns the management address per session/
    )
    const results = await Promise.all([
      service.createWithEnrollmentCode({ name: 'session-first' }),
      service.createWithEnrollmentCode({ name: 'session-second' }),
    ])
    for (const { gateway, enrollmentCode } of results) {
      await gateway.refresh()
      assert.equal(gateway.vpnProvider, 'session_test')
      assert.isNull(gateway.managementIpAddress)
      assert.match(gateway.vpnResources?.connectorId ?? '', /^identity-session-resource-/)
      assert.match(enrollmentCode, /^[A-Za-z0-9_-]{43}$/)
    }
    assert.isEmpty(await db.from('gateway_ip_reservations'))
  })

  test('holds a session-addressed gateway name when the remote create outcome is unclear', async ({
    assert,
  }) => {
    let attempts = 0
    const provider: SessionAddressVpnProvider = {
      ...alpha,
      managementAddressMode: 'session',
      resolveManagementAddress: async () => null,
      async createGateway() {
        attempts++
        throw new Error('Connection closed during creation')
      },
    }
    const service = new GatewayProvisioningService(provider)
    await assert.rejects(
      () => service.createWithEnrollmentCode({ name: 'session-pending' }),
      /requires reconciliation/
    )
    const pending = await db.from('gateway_ip_reservations').firstOrFail()
    assert.isNull(pending.management_ip_address)
    assert.equal(pending.status, 'reconciliation_required')
    assert.isString(pending.gateway_name_key)
    await assert.rejects(
      () => service.createWithEnrollmentCode({ name: ' SESSION-PENDING ' }),
      /Já existe um gateway/
    )
    assert.equal(attempts, 1)
    assert.isEmpty(await Gateway.all())
  })

  test('compensates only a recorded resource when a session adapter returns a different ID', async ({
    assert,
  }) => {
    const removedIds: string[] = []
    let recordResource = true
    const provider: SessionAddressVpnProvider = {
      ...alpha,
      managementAddressMode: 'session',
      resolveManagementAddress: async () => null,
      updateRoutes: undefined,
      async createGateway(_name, _address, onCreated) {
        if (recordResource) await onCreated('recorded-session-resource')
        return { networkId: 'unknown-session-resource', connectorId: 'gateway-identity' }
      },
      async deleteGateway(resourceId) {
        removedIds.push(resourceId)
      },
    }
    const service = new GatewayProvisioningService(provider)

    const mismatch = await service
      .createWithEnrollmentCode({ name: 'session-resource-mismatch' })
      .catch((error) => error)
    assert.propertyVal(mismatch, 'code', 'E_VPN_RESOURCES_INVALID')
    assert.deepEqual(removedIds, ['recorded-session-resource'])
    assert.isEmpty(await db.from('gateway_ip_reservations'))

    recordResource = false
    const unrecorded = await service
      .createWithEnrollmentCode({ name: 'session-resource-unrecorded' })
      .catch((error) => error)
    assert.propertyVal(unrecorded, 'code', 'E_GATEWAY_PROVISIONING_RECONCILIATION_REQUIRED')
    assert.deepEqual(removedIds, ['recorded-session-resource'])
    const pending = await db.from('gateway_ip_reservations').firstOrFail()
    assert.isNull(pending.network_id)
    assert.equal(pending.status, 'reconciliation_required')
    assert.isEmpty(await Gateway.all())
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
      assert.equal(profile.text(), 'client\nroute 100.96.0.0 255.224.0.0 vpn_gateway\n')
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

  test('keeps a gateway when its bound adapter reports a deletion failure', async ({
    client,
    assert,
  }) => {
    const gateway = await new GatewayProvisioningService(alpha).create({
      name: 'unconfirmed-deletion',
      managementIpAddress: '10.42.0.89',
    })
    alpha.deleteGateway = async () => {
      throw Object.assign(new Exception('Provider did not remove its resource.', { status: 502 }), {
        upstreamMethod: 'DELETE',
        upstreamStatus: 404,
      })
    }
    const response = await client
      .delete(`/api/v1/gateways/${gateway.id}`)
      .header('authorization', authorization)
    response.assertStatus(502)
    await gateway.refresh()
    assert.equal(gateway.vpnProvider, 'alpha')
    assert.isString(gateway.vpnResources?.networkId)
  })

  test('removes the local gateway when an old remote network is rejected', async ({ client, assert }) => {
    const gateway = await Gateway.create({ name: 'legacy-rejected', managementIpAddress: '10.42.0.89', vpnProvider: 'cloudconnexa', ccNetworkId: 'old-network' })
    const originalDelete = CloudConnexaService.prototype.deleteNetwork
    CloudConnexaService.prototype.deleteNetwork = async () => {
      throw Object.assign(new Error('old remote resource'), { upstreamMethod: 'DELETE', upstreamStatus: 400 })
    }
    try {
      const response = await client.delete(`/api/v1/gateways/${gateway.id}`).header('authorization', authorization)
      response.assertStatus(204)
      assert.isNull(await Gateway.find(gateway.id))
    } finally {
      CloudConnexaService.prototype.deleteNetwork = originalDelete
    }
  })

  test('attaches and removes a gateway without managing the external VPN infrastructure', async ({
    client,
    assert,
  }) => {
    const provider: AttachedVpnProvider = {
      id: 'attached_test',
      lifecycle: 'attached',
      managementAddressMode: 'session',
      resolveManagementAddress: async () => '10.42.0.91',
      async attachGateway(reference) {
        assert.equal(reference, 'external-certificate-reference')
        return { connectorId: 'resolved-external-identity' }
      },
    }
    config.set('vpn.providers.attached_test', () => provider)
    const payload = {
      name: 'attached-gateway',
      providerId: 'attached_test',
      reference: 'external-certificate-reference',
      sshHostKeyFingerprint: `SHA256:${'a'.repeat(43)}`,
    }
    const response = await client
      .post('/api/v1/gateways/attach')
      .header('authorization', authorization)
      .json(payload)
    response.assertStatus(201)
    assert.notProperty(response.body(), 'enrollmentCode')
    assert.notInclude(response.text(), payload.reference)
    const gateway = await Gateway.findByOrFail('name', payload.name)
    assert.isNull(gateway.managementIpAddress)
    assert.deepEqual(gateway.vpnResources, {
      ownership: 'attached',
      connectorId: 'resolved-external-identity',
    })
    assert.equal(gateway.sshHostKeyFingerprint, payload.sshHostKeyFingerprint)
    assert.isEmpty(await db.from('gateway_enrollments'))

    await assert.rejects(
      () => new GatewayProvisioningService().attach({ ...payload, name: 'duplicate-external' }),
      /external VPN gateway is already bound/
    )
    config.set('vpn.providers', original.providers)
    const deletion = await client
      .delete(`/api/v1/gateways/${gateway.id}`)
      .header('authorization', authorization)
    deletion.assertStatus(204)
    assert.isNull(await Gateway.find(gateway.id))
  })

  test('rejects invalid or resource-owning external bindings', async ({ assert }) => {
    let result: unknown = { connectorId: 'external-identity', networkId: 'shared-endpoint' }
    const provider: AttachedVpnProvider = {
      id: 'attached_test',
      lifecycle: 'attached',
      async attachGateway() {
        return result as never
      },
    }
    config.set('vpn.providers.attached_test', () => provider)
    const service = new GatewayProvisioningService()
    const payload = {
      providerId: 'attached_test',
      name: 'attached-invalid',
      reference: 'external-reference',
      sshHostKeyFingerprint: `SHA256:${'a'.repeat(43)}`,
    }
    await assert.rejects(() => service.attach(payload), /must match the address mode/)
    for (const binding of [result, 'invalid-binding']) {
      result = binding
      await assert.rejects(
        () => service.attach({ ...payload, managementIpAddress: '10.42.0.90' }),
        /invalid external gateway binding/
      )
    }
    config.set('vpn.providers.attached_test', () => ({
      ...provider,
      updateRoutes: async () => {},
    }))
    await assert.rejects(() => resolveVpnProvider(provider.id), /Invalid VPN provider adapter/)
    assert.isEmpty(await Gateway.all())
    assert.isEmpty(await db.from('gateway_ip_reservations'))
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
