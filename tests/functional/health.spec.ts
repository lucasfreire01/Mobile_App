import { test } from '@japa/runner'
import type { ApiClient } from '@japa/api-client'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import Gateway from '#models/gateway'
import GatewayNetworkOperation from '#models/gateway_network_operation'
import User from '#models/user'

test.group('Health API', (group) => {
  group.each.setup(async () => {
    await GatewayNetworkOperation.query().delete()
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

    return response.body().data.token as string
  }

  test('reports application and database health', async ({ client, assert }) => {
    const response = await client.get('/health')

    response.assertStatus(200)
    assert.deepEqual(response.body(), {
      status: 'ok',
      database: 'ok',
    })
  })

  test('denies unauthenticated queue health requests', async ({ client }) => {
    const response = await client.get('/api/v1/health/queue')

    response.assertStatus(401)
  })

  test('reports an empty queue as healthy', async ({ client, assert }) => {
    const token = await login(client)

    const response = await client
      .get('/api/v1/health/queue')
      .header('authorization', `Bearer ${token}`)

    response.assertStatus(200)
    assert.deepEqual(response.body(), {
      status: 'ok',
      queue: {
        pending: 0,
        applying: 0,
        failed: 0,
        expiredLeases: 0,
        oldestPendingSeconds: null,
      },
    })
  })

  test('reports queue operation counters', async ({ client, assert }) => {
    const token = await login(client)

    const gateway = await Gateway.create({
      name: 'gateway-health-test',
      managementIpAddress: '10.42.0.126',
      status: 'offline',
    })

    await GatewayNetworkOperation.createMany([
      {
        gatewayId: gateway.id,
        action: 'apply_dhcp',
        status: 'pending',
        attempts: 0,
      },
      {
        gatewayId: gateway.id,
        action: 'apply_dhcp',
        status: 'applying',
        attempts: 1,
        processingToken: '11111111-1111-4111-8111-111111111111',
        processingExpiresAt: DateTime.now().plus({ minutes: 5 }),
      },
      {
        gatewayId: gateway.id,
        action: 'apply_dhcp',
        status: 'applying',
        attempts: 1,
        processingToken: '22222222-2222-4222-8222-222222222222',
        processingExpiresAt: DateTime.now().minus({ minutes: 1 }),
      },
      {
        gatewayId: gateway.id,
        action: 'apply_dhcp',
        status: 'failed',
        attempts: 5,
      },
    ])

    const response = await client
      .get('/api/v1/health/queue')
      .header('authorization', `Bearer ${token}`)

    response.assertStatus(200)
    assert.equal(response.body().status, 'degraded')
    assert.equal(response.body().queue.pending, 1)
    assert.equal(response.body().queue.applying, 2)
    assert.equal(response.body().queue.failed, 1)
    assert.equal(response.body().queue.expiredLeases, 1)
    const oldestPendingSeconds = response.body().queue.oldestPendingSeconds as number | null
    assert.isNumber(oldestPendingSeconds)
    assert.isAtLeast(oldestPendingSeconds as number, 0)
  })
})
