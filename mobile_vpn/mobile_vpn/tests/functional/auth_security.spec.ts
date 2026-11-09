import { test } from '@japa/runner'
import { randomUUID } from 'node:crypto'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import limiter from '@adonisjs/limiter/services/main'
import User from '#models/user'
import Gateway from '#models/gateway'

test.group('Authentication security', (group) => {
  group.each.setup(() => limiter.clear())

  async function createUser() {
    return User.create({ email: `${randomUUID()}@example.test`, password: 'test-password-123' })
  }

  test('does not expose public registration', async ({ client }) => {
    const response = await client.request('/api/v1/auth/signup', 'POST').json({})
    response.assertStatus(404)
  })

  test('denies ordinary accounts every gateway and queue administration route', async ({
    client,
  }) => {
    const user = await createUser()
    const token = await User.accessTokens.create(user)
    const headers = { authorization: `Bearer ${token.value!.release()}` }
    const paths = [
      ['GET', '/gateways'],
      ['POST', '/gateways'],
      ['GET', '/gateways/999999'],
      ['PUT', '/gateways/999999'],
      ['DELETE', '/gateways/999999'],
      ['GET', '/gateways/999999/vpn-profile'],
      ['GET', '/gateways/999999/network-operations'],
      ['GET', '/gateways/999999/ssh-host-key/rotations'],
      ['POST', '/gateways/999999/ssh-host-key/rotate'],
      ['GET', '/gateways/999999/security-alerts'],
      ['POST', '/gateways/999999/security-alerts/1/acknowledge'],
      ['GET', '/gateways/999999/ethernet'],
      ['POST', '/gateways/999999/ethernet'],
      ['GET', '/gateways/999999/ethernet/1'],
      ['PUT', '/gateways/999999/ethernet/1'],
      ['GET', '/gateways/999999/ethernet/hostname'],
      ['GET', '/gateways/999999/ethernet/device'],
      ['POST', '/gateways/999999/ethernet/apply'],
      ['GET', '/health/queue'],
    ]
    for (const [method, path] of paths) {
      const response = await client.request(`/api/v1${path}`, method).headers(headers)
      response.assertStatus(403)
    }
    const profile = await client.get('/api/v1/account/profile').headers(headers)
    profile.assertStatus(200)
  })

  test('issues expiring tokens and rejects expired tokens', async ({ client, assert }) => {
    const user = await createUser()
    const response = await client.post('/api/v1/auth/login').json({
      email: user.email,
      password: 'test-password-123',
    })
    response.assertStatus(200)
    const stored = await db.from('auth_access_tokens').where('tokenable_id', user.id).first()
    assert.isNotNull(stored.expires_at)
    assert.isBelow(DateTime.fromJSDate(new Date(stored.expires_at)).diffNow('hours').hours, 25)
    await db
      .from('auth_access_tokens')
      .where('id', stored.id)
      .update({
        expires_at: DateTime.now().minus({ minutes: 1 }).toSQL({ includeOffset: false }),
      })
    const expired = await client
      .get('/api/v1/account/profile')
      .header('authorization', `Bearer ${response.body().data.token}`)
    expired.assertStatus(401)
  })

  test('limits login attempts even when the supplied email changes', async ({ client }) => {
    for (let attempt = 0; attempt < 10; attempt++) {
      await client
        .post('/api/v1/auth/login')
        .json({ email: `${randomUUID()}@example.test`, password: 'incorrect' })
    }
    const response = await client
      .post('/api/v1/auth/login')
      .json({ email: 'other@example.test', password: 'incorrect' })
    response.assertStatus(429)
  })

  test('rejects untrusted management IPs before provisioning or changing a gateway', async ({
    client,
    assert,
  }) => {
    const user = await createUser()
    user.isAdmin = true
    await user.save()
    const token = await User.accessTokens.create(user)
    const headers = { authorization: `Bearer ${token.value!.release()}` }
    const created = await client.post('/api/v1/gateways').headers(headers).json({
      name: 'untrusted-target',
      managementIpAddress: '169.254.169.254',
    })
    created.assertStatus(422)
    assert.isNull(await Gateway.findBy('name', 'untrusted-target'))

    const gateway = await Gateway.create({
      name: 'address-policy-test',
      managementIpAddress: '10.42.0.126',
    })
    const updated = await client.put(`/api/v1/gateways/${gateway.id}`).headers(headers).json({
      name: gateway.name,
      managementIpAddress: '127.0.0.1',
    })
    updated.assertStatus(422)
    await gateway.refresh()
    assert.equal(gateway.managementIpAddress, '10.42.0.126')
  })

  test('logout revokes the current token', async ({ client }) => {
    const user = await createUser()
    const token = await User.accessTokens.create(user)
    const headers = { authorization: `Bearer ${token.value!.release()}` }
    const response = await client.post('/api/v1/account/logout').headers(headers)
    response.assertStatus(200)
    const revoked = await client.get('/api/v1/account/profile').headers(headers)
    revoked.assertStatus(401)
  })
})
