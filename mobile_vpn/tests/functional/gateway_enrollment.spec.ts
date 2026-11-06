import { test } from '@japa/runner'
import { createHash } from 'node:crypto'
import db from '@adonisjs/lucid/services/db'
import Gateway from '#models/gateway'
import User from '#models/user'
import CloudConnexaService from '#services/cloud_connexa_service'
import CloudConnexaProvider from '#services/vpn/cloud_connexa_provider'
import GatewayProvisioningService from '#services/gateway_provisioning_service'

test.group('Gateway enrollment', (group) => {
  const profile = '<cert>\nFAKE-CERT\n</cert>\n<key>\nFAKE-KEY\n</key>\n'
  const originalCreate = CloudConnexaService.prototype.createGatewayResources
  const originalDelete = CloudConnexaService.prototype.deleteNetwork
  const originalProfile = CloudConnexaProvider.prototype.getProfile
  let profileCalls: number

  group.each.setup(async () => {
    await db.from('gateway_ip_reservations').delete()
    await Gateway.query().delete()
    profileCalls = 0
    CloudConnexaService.prototype.createGatewayResources = async (_name, _ip, onCreated) => {
      await onCreated?.('test-network')
      return { networkId: 'test-network', connectorId: 'test-connector', ipServiceId: 'test-route' }
    }
    CloudConnexaService.prototype.deleteNetwork = async () => {}
    CloudConnexaProvider.prototype.getProfile = async () => {
      profileCalls++
      return { content: profile, format: 'openvpn' }
    }
    return async () => {
      CloudConnexaService.prototype.createGatewayResources = originalCreate
      CloudConnexaService.prototype.deleteNetwork = originalDelete
      CloudConnexaProvider.prototype.getProfile = originalProfile
    }
  })

  test('creation returns a temporary code and stores only its hash', async ({ client, assert }) => {
    const user = await User.create({
      email: `enrollment-${Date.now()}@example.test`, password: 'test-only-password', isAdmin: true,
    })
    const token = await User.accessTokens.create(user)
    const response = await client.post('/api/v1/gateways')
      .header('authorization', `Bearer ${token.value!.release()}`)
      .json({ name: 'enrollment-test' })
    response.assertStatus(201)
    const body = response.body()
    if (!('gateway' in body) || !('enrollmentCode' in body)) {
      throw new Error('Gateway creation response is missing enrollment fields')
    }
    const { gateway, enrollmentCode } = body
    assert.match(enrollmentCode, /^[A-Za-z0-9_-]{43}$/)
    const row = await db.from('gateway_enrollments').where('gateway_id', gateway.id).firstOrFail()
    assert.equal(row.token_hash, createHash('sha256').update(enrollmentCode).digest('hex'))
    assert.notInclude(JSON.stringify(row), enrollmentCode)
    assert.isNull(row.claimed_at)
    const remaining = new Date(row.expires_at).getTime() - Date.now()
    assert.isAbove(remaining, 23 * 60 * 60 * 1000)
    assert.isAtMost(remaining, 24 * 60 * 60 * 1000)
    response.assertHeader('cache-control', 'no-store')
  })

  test('claim returns the profile without consuming the code, allowing a retry', async ({ client, assert }) => {
    const { gateway, enrollmentCode } = await new GatewayProvisioningService().createWithEnrollmentCode({ name: 'claim-test' })
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await client.post('/api/v1/gateways/enrollment/claim').json({ code: enrollmentCode })
      response.assertStatus(200)
      response.assertHeader('cache-control', 'no-store')
      assert.equal(response.body().gateway.id, gateway.id)
      assert.equal(Buffer.from(response.body().vpn.contentBase64, 'base64').toString(), profile)
    }
    assert.isNull((await db.from('gateway_enrollments').where('gateway_id', gateway.id).firstOrFail()).claimed_at)
  })

  test('unknown and malformed codes do not retrieve a profile', async ({ client, assert }) => {
    const unknown = await client.post('/api/v1/gateways/enrollment/claim').json({ code: 'A'.repeat(43) })
    unknown.assertStatus(404)
    const malformed = await client.post('/api/v1/gateways/enrollment/claim').json({ code: 'invalid' })
    malformed.assertStatus(422)
    assert.equal(profileCalls, 0)
  })

  test('expired codes cannot claim or complete enrollment', async ({ client, assert }) => {
    const { gateway, enrollmentCode } = await new GatewayProvisioningService().createWithEnrollmentCode({ name: 'expired-test' })
    await db.from('gateway_enrollments').where('gateway_id', gateway.id).update({ expires_at: new Date(Date.now() - 1000) })
    for (const action of ['claim', 'complete']) {
      const response = await client.post(`/api/v1/gateways/enrollment/${action}`).json({ code: enrollmentCode })
      response.assertStatus(404)
    }
    assert.equal(profileCalls, 0)
  })

  test('completion consumes the code and rejects later claim or completion', async ({ client, assert }) => {
    const { gateway, enrollmentCode } = await new GatewayProvisioningService().createWithEnrollmentCode({ name: 'complete-test' })
    const response = await client.post('/api/v1/gateways/enrollment/complete').json({ code: enrollmentCode })
    response.assertStatus(204)
    assert.isNotNull((await db.from('gateway_enrollments').where('gateway_id', gateway.id).firstOrFail()).claimed_at)
    for (const action of ['claim', 'complete']) {
      const retry = await client.post(`/api/v1/gateways/enrollment/${action}`).json({ code: enrollmentCode })
      retry.assertStatus(404)
    }
    assert.equal(profileCalls, 0)
  })

  test('invalid provider profile leaves the enrollment available for retry', async ({ client, assert }) => {
    const { gateway, enrollmentCode } = await new GatewayProvisioningService().createWithEnrollmentCode({ name: 'invalid-profile-test' })
    CloudConnexaProvider.prototype.getProfile = async () => ({ content: profile, format: 'invalid' as 'openvpn' })
    const response = await client.post('/api/v1/gateways/enrollment/claim').json({ code: enrollmentCode })
    response.assertStatus(502)
    assert.isNull((await db.from('gateway_enrollments').where('gateway_id', gateway.id).firstOrFail()).claimed_at)
  })
})
