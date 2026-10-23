import { test } from '@japa/runner'
import type { ApiClient } from '@japa/api-client'
import db from '@adonisjs/lucid/services/db'
import Gateway from '#models/gateway'
import GatewayEthernetConfig from '#models/gateway_ethernet_config'
import GatewayNetworkOperation from '#models/gateway_network_operation'
import User from '#models/user'
import { DateTime } from 'luxon'

test.group('Gateway network operations API', (group) => {
  group.each.setup(async () => {
    await GatewayNetworkOperation.query().delete()
    await GatewayEthernetConfig.query().delete()
    await Gateway.query().delete()
    await db.from('auth_access_tokens').delete()
    await User.query().delete()
  })

  async function login(client: ApiClient) {
    const password = 'test-password-123'
    await User.create({
      fullName: 'Test Operator',
      email: 'operator@example.test',
      password,
    })

    const response = await client.post('/api/v1/auth/login').json({
      email: 'operator@example.test',
      password,
    })

    if (response.status() !== 200) {
      throw new Error(`Login failed: ${JSON.stringify(response.body())}`)
    }
    return response.body().data.token as string
  }

  async function createGatewayWithDhcpConfig() {
    const gateway = await Gateway.create({
      name: 'gateway-test',
      managementIpAddress: '10.42.0.126',
      status: 'offline',
    })

    await GatewayEthernetConfig.create({
      gatewayId: gateway.id,
      mode: 'dhcp',
      dhcpFallbackEnabled: false,
    })

    return gateway
  }

  test('denies an unauthenticated request', async ({ client }) => {
    const response = await client.get('/api/v1/gateways/999/network-operations')

    response.assertStatus(401)
  })

  test('queues a DHCP operation and returns 202', async ({ client, assert }) => {
    const token = await login(client)
    const gateway = await createGatewayWithDhcpConfig()

    const response = await client
      .post(`/api/v1/gateways/${gateway.id}/ethernet/apply`)
      .header('authorization', `Bearer ${token}`)

    response.assertStatus(202)
    assert.equal(response.body().message, 'Ethernet configuration queued.')
    assert.equal(response.body().operation.gatewayId, gateway.id)
    assert.equal(response.body().operation.action, 'apply_dhcp')
    assert.equal(response.body().operation.status, 'pending')
    assert.equal(response.body().operation.attempts, 0)

    const operation = await GatewayNetworkOperation.findOrFail(response.body().operation.id)
    assert.equal(operation.status, 'pending')
  })

  test('rejects a second operation while one is pending', async ({ client, assert }) => {
    const token = await login(client)
    const gateway = await createGatewayWithDhcpConfig()

    const firstResponse = await client
      .post(`/api/v1/gateways/${gateway.id}/ethernet/apply`)
      .header('authorization', `Bearer ${token}`)
    const secondResponse = await client
      .post(`/api/v1/gateways/${gateway.id}/ethernet/apply`)
      .header('authorization', `Bearer ${token}`)

    firstResponse.assertStatus(202)
    secondResponse.assertStatus(409)
    assert.equal(secondResponse.body().message, 'Gateway already has a network operation in progress.')
  })

  test('lists operations from newest to oldest', async ({ client, assert }) => {
    const token = await login(client)
    const gateway = await createGatewayWithDhcpConfig()
    const older = await GatewayNetworkOperation.create({
      gatewayId: gateway.id,
      action: 'apply_dhcp',
      status: 'applied',
      attempts: 1,
      createdAt: DateTime.now().minus({ minutes: 1 }),
    })
    const newer = await GatewayNetworkOperation.create({
      gatewayId: gateway.id,
      action: 'apply_static',
      status: 'failed',
      attempts: 5,
      createdAt: DateTime.now(),
    })

    const response = await client
      .get(`/api/v1/gateways/${gateway.id}/network-operations`)
      .header('authorization', `Bearer ${token}`)

    response.assertStatus(200)
    assert.deepEqual(
      response.body().operations.map((operation: { id: number }) => operation.id),
      [newer.id, older.id]
    )
  })

  test('rejects an incomplete DHCP fallback configuration', async ({ client }) => {
    const token = await login(client)
    const gateway = await Gateway.create({
      name: 'gateway-test',
      managementIpAddress: '10.42.0.126',
      status: 'offline',
    })

    const response = await client
      .post(`/api/v1/gateways/${gateway.id}/ethernet`)
      .header('authorization', `Bearer ${token}`)
      .json({
        mode: 'dhcp',
        dhcpFallbackEnabled: true,
      })

    response.assertStatus(422)
  })
})
