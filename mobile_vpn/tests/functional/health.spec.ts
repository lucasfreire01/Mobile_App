import { test } from '@japa/runner'
import type { ApiClient } from '@japa/api-client'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import Gateway from '#models/gateway'
import GatewayNetworkOperation from '#models/gateway_network_operation'
import GatewaySecurityAlert from '#models/gateway_security_alert'
import User from '#models/user'
import limiter from '@adonisjs/limiter/services/main'
import WorkerHeartbeat from '#models/worker_heartbeat'
import WorkerHeartbeatService, {
  GATEWAY_NETWORK_OPERATIONS_WORKER,
} from '#services/worker_heartbeat_service'

test.group('Health API', (group) => {
  group.each.setup(async () => {
    await limiter.clear()
    await GatewaySecurityAlert.query().delete()
    await GatewayNetworkOperation.query().delete()
    await Gateway.query().delete()
    await WorkerHeartbeat.query().delete()
    await db.from('auth_access_tokens').delete()
    await User.query().delete()
  })

  async function login(client: ApiClient) {
    const password = 'test-password-123'

    await User.create({
      fullName: 'Test Operator',
      isAdmin: true,
      email: 'operator@example.test',
      password,
    })

    const response = await client.post('/api/v1/auth/login').json({
      email: 'operator@example.test',
      password,
    })

    return response.body().data.token as string
  }

  async function recordWorkerHeartbeat() {
    await new WorkerHeartbeatService().beat(GATEWAY_NETWORK_OPERATIONS_WORKER)
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
    await recordWorkerHeartbeat()

    const response = await client
      .get('/api/v1/health/queue')
      .header('authorization', `Bearer ${token}`)

    response.assertStatus(200)
    assert.equal(response.body().status, 'ok')
    assert.deepEqual(response.body().queue, {
      pending: 0,
      applying: 0,
      failed: 0,
      expiredLeases: 0,
      recentHostKeyMismatches: 0,
      openHostKeyMismatchAlerts: 0,
      oldestPendingSeconds: null,
    })
    assert.equal(response.body().worker.name, GATEWAY_NETWORK_OPERATIONS_WORKER)
    assert.equal(response.body().worker.status, 'ok')
    assert.isString(response.body().worker.lastSeenAt)
    assert.isNumber(response.body().worker.ageSeconds)
  })

  test('reports queue operation counters', async ({ client, assert }) => {
    const token = await login(client)
    await recordWorkerHeartbeat()

    const gateway = await Gateway.create({
      name: 'gateway-health-test',
      managementIpAddress: '10.42.0.126',
      status: 'offline',
    })
    const activeGateway = await Gateway.create({
      name: 'gateway-health-active-test',
      managementIpAddress: '10.42.0.127',
      status: 'offline',
    })
    const expiredGateway = await Gateway.create({
      name: 'gateway-health-expired-test',
      managementIpAddress: '10.42.0.128',
      status: 'offline',
    })

    await GatewayNetworkOperation.createMany([
      {
        gatewayId: activeGateway.id,
        action: 'apply_dhcp',
        status: 'pending',
        attempts: 0,
      },
      {
        gatewayId: expiredGateway.id,
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
    assert.equal(response.body().queue.recentHostKeyMismatches, 0)
    assert.equal(response.body().queue.openHostKeyMismatchAlerts, 0)
    const oldestPendingSeconds = response.body().queue.oldestPendingSeconds as number | null
    assert.isNumber(oldestPendingSeconds)
    assert.isAtLeast(oldestPendingSeconds as number, 0)
    assert.equal(response.body().worker.status, 'ok')
  })

  test('reports a missing worker heartbeat as degraded', async ({ client, assert }) => {
    const token = await login(client)

    const response = await client
      .get('/api/v1/health/queue')
      .header('authorization', `Bearer ${token}`)

    response.assertStatus(200)
    assert.equal(response.body().status, 'degraded')
    assert.equal(response.body().worker.status, 'stale')
    assert.isNull(response.body().worker.lastSeenAt)
    assert.isNull(response.body().worker.ageSeconds)
  })

  test('reports a recent SSH host key mismatch as degraded', async ({ client, assert }) => {
    const token = await login(client)
    await recordWorkerHeartbeat()
    const gateway = await Gateway.create({
      name: 'gateway-host-key-mismatch',
      managementIpAddress: '10.42.0.126',
      status: 'offline',
    })

    await GatewayNetworkOperation.create({
      gatewayId: gateway.id,
      action: 'apply_dhcp',
      status: 'failed',
      attempts: 1,
      errorCode: 'E_GATEWAY_SSH_HOST_KEY_MISMATCH',
      errorMessage: 'Gateway SSH host key fingerprint does not match the registered gateway.',
      finishedAt: DateTime.now(),
    })

    const response = await client
      .get('/api/v1/health/queue')
      .header('authorization', `Bearer ${token}`)

    response.assertStatus(200)
    assert.equal(response.body().status, 'degraded')
    assert.equal(response.body().queue.recentHostKeyMismatches, 1)
  })
})
