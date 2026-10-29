import { test } from '@japa/runner'
import type { ApiClient } from '@japa/api-client'
import db from '@adonisjs/lucid/services/db'
import Gateway from '#models/gateway'
import GatewaySshHostKeyRotation from '#models/gateway_ssh_host_key_rotation'
import User from '#models/user'
import limiter from '@adonisjs/limiter/services/main'

const ORIGINAL_FINGERPRINT = 'SHA256:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
const ROTATED_FINGERPRINT = 'SHA256:BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB'

test.group('Gateway SSH host key rotation API', (group) => {
  group.each.setup(async () => {
    await limiter.clear()
    await GatewaySshHostKeyRotation.query().delete()
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

  async function createGateway() {
    return Gateway.create({
      name: 'gateway-host-key-test',
      managementIpAddress: '10.42.0.126',
      sshHostKeyFingerprint: ORIGINAL_FINGERPRINT,
      status: 'offline',
    })
  }

  test('rotates a host key and records an immutable audit event', async ({ client, assert }) => {
    const { token, user } = await login(client)
    const gateway = await createGateway()

    const response = await client
      .post(`/api/v1/gateways/${gateway.id}/ssh-host-key/rotate`)
      .header('authorization', `Bearer ${token}`)
      .json({
        sshHostKeyFingerprint: ROTATED_FINGERPRINT,
        reason: 'Gateway hardware replacement',
      })

    response.assertStatus(200)
    assert.equal(response.body().rotation.gatewayId, gateway.id)
    assert.equal(response.body().rotation.requestedByUserId, user.id)
    assert.equal(response.body().rotation.requestedByEmail, user.email)
    assert.equal(response.body().rotation.previousFingerprint, ORIGINAL_FINGERPRINT)
    assert.equal(response.body().rotation.nextFingerprint, ROTATED_FINGERPRINT)
    assert.equal(response.body().rotation.reason, 'Gateway hardware replacement')

    await gateway.refresh()
    assert.equal(gateway.sshHostKeyFingerprint, ROTATED_FINGERPRINT)

    const rotation = await GatewaySshHostKeyRotation.findOrFail(response.body().rotation.id)
    assert.equal(rotation.previousFingerprint, ORIGINAL_FINGERPRINT)
    assert.equal(rotation.nextFingerprint, ROTATED_FINGERPRINT)
  })

  test('rejects a rotation to the same fingerprint', async ({ client, assert }) => {
    const { token } = await login(client)
    const gateway = await createGateway()

    const response = await client
      .post(`/api/v1/gateways/${gateway.id}/ssh-host-key/rotate`)
      .header('authorization', `Bearer ${token}`)
      .json({
        sshHostKeyFingerprint: ORIGINAL_FINGERPRINT,
        reason: 'No actual change',
      })

    response.assertStatus(409)
    assert.equal(response.body().code, 'E_GATEWAY_SSH_HOST_KEY_UNCHANGED')
    assert.equal(
      await GatewaySshHostKeyRotation.query()
        .count('* as total')
        .then((rows) => Number(rows[0].$extras.total)),
      0
    )
  })

  test('rejects host key changes through the generic gateway update route', async ({
    client,
    assert,
  }) => {
    const { token } = await login(client)
    const gateway = await createGateway()

    const response = await client
      .put(`/api/v1/gateways/${gateway.id}`)
      .header('authorization', `Bearer ${token}`)
      .json({
        name: gateway.name,
        sshHostKeyFingerprint: ROTATED_FINGERPRINT,
      })

    response.assertStatus(403)
    assert.equal(response.body().code, 'E_GATEWAY_SSH_HOST_KEY_ROTATION_REQUIRED')

    await gateway.refresh()
    assert.equal(gateway.sshHostKeyFingerprint, ORIGINAL_FINGERPRINT)
  })

  test('lists host key rotations from newest to oldest', async ({ client, assert }) => {
    const { token, user } = await login(client)
    const gateway = await createGateway()
    await GatewaySshHostKeyRotation.create({
      gatewayId: gateway.id,
      requestedByUserId: user.id,
      requestedByEmail: user.email,
      previousFingerprint: ORIGINAL_FINGERPRINT,
      nextFingerprint: ROTATED_FINGERPRINT,
      reason: 'First recorded rotation',
    })
    const newest = await GatewaySshHostKeyRotation.create({
      gatewayId: gateway.id,
      requestedByUserId: user.id,
      requestedByEmail: user.email,
      previousFingerprint: ROTATED_FINGERPRINT,
      nextFingerprint: ORIGINAL_FINGERPRINT,
      reason: 'Second recorded rotation',
    })

    const response = await client
      .get(`/api/v1/gateways/${gateway.id}/ssh-host-key/rotations?page=1&limit=1`)
      .header('authorization', `Bearer ${token}`)

    response.assertStatus(200)
    assert.equal(response.body().rotations.length, 1)
    assert.equal(response.body().rotations[0].id, newest.id)
    assert.equal(response.body().rotations[0].reason, 'Second recorded rotation')
    assert.equal(response.body().meta.total, 2)
    assert.equal(response.body().meta.perPage, 1)
  })
})
