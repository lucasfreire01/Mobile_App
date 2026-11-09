import { test } from '@japa/runner'
import type { ApiClient } from '@japa/api-client'
import db from '@adonisjs/lucid/services/db'
import Gateway from '#models/gateway'
import GatewayNetworkOperation from '#models/gateway_network_operation'
import GatewaySecurityAlert from '#models/gateway_security_alert'
import User from '#models/user'
import limiter from '@adonisjs/limiter/services/main'

test.group('Gateway security alerts API', (group) => {
  group.each.setup(async () => {
    await limiter.clear()
    await GatewaySecurityAlert.query().delete()
    await GatewayNetworkOperation.query().delete()
    await Gateway.query().delete()
    await db.from('auth_access_tokens').delete()
    await User.query().delete()
  })

  async function login(client: ApiClient) {
    const password = 'test-password-123'
    const user = await User.create({
      fullName: 'Test Operator',
      isAdmin: true,
      email: 'operator@example.test',
      password,
    })
    const response = await client.post('/api/v1/auth/login').json({
      email: user.email,
      password,
    })

    return { token: response.body().data.token as string, user }
  }

  async function createOpenAlert(gateway: Gateway) {
    const operation = await GatewayNetworkOperation.create({
      gatewayId: gateway.id,
      action: 'apply_dhcp',
      status: 'failed',
      attempts: 1,
      errorCode: 'E_GATEWAY_SSH_HOST_KEY_MISMATCH',
      errorMessage: 'Gateway SSH host key fingerprint does not match.',
    })

    return GatewaySecurityAlert.create({
      gatewayId: gateway.id,
      operationId: operation.id,
      type: 'ssh_host_key_mismatch',
      status: 'open',
      message: 'Gateway SSH host key does not match the pinned fingerprint.',
    })
  }

  test('lists and acknowledges a gateway security alert', async ({ client, assert }) => {
    const { token, user } = await login(client)
    const gateway = await Gateway.create({
      name: 'gateway-security-alert-test',
      managementIpAddress: '10.42.0.126',
      status: 'offline',
    })
    const alert = await createOpenAlert(gateway)

    const listResponse = await client
      .get(`/api/v1/gateways/${gateway.id}/security-alerts?page=1&limit=20`)
      .header('authorization', `Bearer ${token}`)

    listResponse.assertStatus(200)
    assert.equal(listResponse.body().alerts.length, 1)
    assert.equal(listResponse.body().alerts[0].id, alert.id)
    assert.equal(listResponse.body().alerts[0].status, 'open')

    const acknowledgeResponse = await client
      .post(`/api/v1/gateways/${gateway.id}/security-alerts/${alert.id}/acknowledge`)
      .header('authorization', `Bearer ${token}`)

    acknowledgeResponse.assertStatus(200)
    assert.equal(acknowledgeResponse.body().alert.status, 'acknowledged')
    assert.equal(acknowledgeResponse.body().alert.acknowledgedByUserId, user.id)
    assert.equal(acknowledgeResponse.body().alert.acknowledgedByEmail, user.email)
    assert.isString(acknowledgeResponse.body().alert.acknowledgedAt)
  })
})
