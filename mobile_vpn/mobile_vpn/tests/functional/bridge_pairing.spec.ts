import { test } from '@japa/runner'
import { createHash, generateKeyPairSync, randomBytes, randomUUID, sign } from 'node:crypto'
import db from '@adonisjs/lucid/services/db'
import encryption from '@adonisjs/core/services/encryption'
import limiter from '@adonisjs/limiter/services/main'
import Gateway from '#models/gateway'
import User from '#models/user'
import BridgePairingService from '#services/bridge_pairing_service'
import GatewayProvisioningService from '#services/gateway_provisioning_service'

const mac = '00:16:16:2b:c7:26'
const code = 'T'.repeat(43)
async function enrollment() {
  const gateway = await Gateway.create({ name: 'relay-test', status: 'offline' })
  await db.table('gateway_enrollments').insert({
    gateway_id: gateway.id,
    token_hash: createHash('sha256').update(code).digest('hex'),
    expires_at: new Date(Date.now() + 60_000),
  })
  return gateway
}
async function identity(service: BridgePairingService, userId = 1) {
  const grant = await service.provisionBridge(userId)
  const bridgeToken = randomBytes(32).toString('base64url')
  const active = await service.activateBridge(grant.bridgeId, grant.installationToken, bridgeToken)
  return { bridgeId: active.bridgeId, token: bridgeToken }
}
async function session(service: BridgePairingService, userId = 1) {
  return service.create([mac], await identity(service, userId))
}
async function expire(key: string) {
  const row = await db.from('saganexus_shared_cache').where('key', key).firstOrFail()
  const payload = encryption.decrypt<Record<string, unknown>>(row.payload)!
  payload.expiresAt = Date.now() - 1
  await db
    .from('saganexus_shared_cache')
    .where('key', key)
    .update({ payload: encryption.encrypt(payload) })
}

test.group('Account-bound automatic bridge pairing', (group) => {
  group.each.setup(async () => {
    await limiter.clear(['memory'])
    await db.from('saganexus_shared_cache').where('key', 'like', '%bridge%').delete()
    await db.from('gateway_ip_reservations').delete()
    await Gateway.query().delete()
  })

  test('HTTP flow activates the installation and pairs entirely through the account without a PC code', async ({
    client,
    assert,
  }) => {
    const gateway = await enrollment()
    const admin = await User.create({
      email: `${randomUUID()}@example.test`,
      password: 'test-only-password',
      isAdmin: true,
    })
    const token = await User.accessTokens.create(admin)
    const access = token.value!.release()
    const provisioned = await client
      .post('/api/v1/gateway-bridges')
      .header('authorization', `Bearer ${access}`)
    provisioned.assertStatus(201)
    provisioned.assertHeader('cache-control', 'no-store')
    const grant = provisioned.body() as unknown as { bridgeId: string; installationToken: string }
    const pcToken = randomBytes(32).toString('base64url')
    const activated = await client
      .post(`/api/v1/gateway-bridges/${grant.bridgeId}/activate`)
      .header('authorization', `Bearer ${grant.installationToken}`)
      .json({ bridgeToken: pcToken })
    activated.assertStatus(201)
    activated.assertHeader('cache-control', 'no-store')
    const active = activated.body()
    const created = await client
      .post('/api/v1/gateway-bridge-sessions')
      .header('authorization', `Bearer ${pcToken}`)
      .json({ bridgeId: active.bridgeId, gatewayMacs: [mac] })
    created.assertStatus(201)
    created.assertHeader('cache-control', 'no-store')
    const current = created.body()
    assert.notProperty(current, 'confirmationCode')
    const path = `/api/v1/gateway-bridge-sessions/${current.sessionId}`
    const input = { gatewayId: gateway.id, gatewayMac: mac, enrollmentCode: code }
    const anonymous = await client.post(`${path}/approve`).json(input)
    anonymous.assertStatus(401)
    const approved = await client
      .post(`${path}/approve`)
      .header('authorization', `Bearer ${access}`)
      .json(input)
    approved.assertStatus(200)
    assert.notInclude(JSON.stringify(approved.body()), code)
    const wrongToken = await client
      .post(`${path}/poll`)
      .header('authorization', `Bearer ${'X'.repeat(43)}`)
    wrongToken.assertStatus(403)
    const polled = await client
      .post(`${path}/poll`)
      .header('authorization', `Bearer ${current.bridgeToken}`)
    polled.assertStatus(200)
    polled.assertHeader('cache-control', 'no-store')
    assert.equal(polled.body().enrollmentCode, code)
    const receipt = await client
      .post(`${path}/result`)
      .header('authorization', `Bearer ${current.bridgeToken}`)
      .json({ outcome: 'submitted' })
    receipt.assertStatus(200)
    const after = await client
      .post(`${path}/poll`)
      .header('authorization', `Bearer ${current.bridgeToken}`)
    assert.deepEqual(after.body(), { status: 'submitted' })
    const status = await client.get(path).header('authorization', `Bearer ${access}`)
    status.assertStatus(200)
    assert.deepEqual(status.body(), { status: 'submitted', gatewayId: gateway.id })
    const revoked = await client
      .delete(`/api/v1/gateway-bridges/${active.bridgeId}`)
      .header('authorization', `Bearer ${access}`)
    revoked.assertStatus(204)
    const revokedPoll = await client
      .post(`${path}/poll`)
      .header('authorization', `Bearer ${current.bridgeToken}`)
    revokedPoll.assertStatus(403)
    await gateway.refresh()
    assert.equal(gateway.status, 'offline')
  })

  test('a PC public key binds activation to its private key without a LAN token', async ({
    assert,
  }) => {
    const service = new BridgePairingService()
    const keys = generateKeyPairSync('ed25519')
    const bridgeId = randomUUID()
    const publicKey = keys.publicKey.export({ type: 'spki', format: 'pem' }).toString()
    const registered = await service.registerBridge(1, bridgeId, publicKey)
    const repeated = await service.registerBridge(1, bridgeId, publicKey)
    assert.deepEqual(repeated, registered)

    const bridgeToken = randomBytes(32).toString('base64url')
    const challenge = Buffer.from(`saganexus-bridge-activate:v1\n${bridgeId}\n${bridgeToken}`)
    const proof = sign(null, challenge, keys.privateKey).toString('base64url')
    const wrongKeys = generateKeyPairSync('ed25519')
    const forgedProof = sign(null, challenge, wrongKeys.privateKey).toString('base64url')
    await assert.rejects(() => service.activateBridge(bridgeId, '', bridgeToken, forgedProof))

    const active = await service.activateBridge(bridgeId, '', bridgeToken, proof)
    assert.equal(active.bridgeId, bridgeId)
    assert.deepEqual(await service.activateBridge(bridgeId, '', bridgeToken, proof), active)

    const otherToken = randomBytes(32).toString('base64url')
    const otherProof = sign(
      null,
      Buffer.from(`saganexus-bridge-activate:v1\n${bridgeId}\n${otherToken}`),
      keys.privateKey
    ).toString('base64url')
    await assert.rejects(() => service.activateBridge(bridgeId, '', otherToken, otherProof))
    await assert.rejects(() => service.registerBridge(2, bridgeId, publicKey))
  })

  test('only an authenticated admin can provision a bridge', async ({ client }) => {
    const anonymous = await client.post('/api/v1/gateway-bridges')
    anonymous.assertStatus(401)
    const user = await User.create({
      email: `${randomUUID()}@example.test`,
      password: 'test-only-password',
      isAdmin: false,
    })
    const token = await User.accessTokens.create(user)
    const forbidden = await client
      .post('/api/v1/gateway-bridges')
      .header('authorization', `Bearer ${token.value!.release()}`)
    forbidden.assertStatus(403)
  })

  test('unregistered, pending, and forged bridge credentials cannot create sessions', async ({
    assert,
  }) => {
    const service = new BridgePairingService()
    const grant = await service.provisionBridge(1)
    await assert.rejects(() =>
      service.create([mac], { bridgeId: grant.bridgeId, token: grant.installationToken })
    )
    await assert.rejects(() =>
      service.create([mac], { bridgeId: randomUUID(), token: 'X'.repeat(43) })
    )
    const valid = await identity(service)
    await assert.rejects(() => service.create([mac], { ...valid, token: 'X'.repeat(43) }))
  })

  test('installation grant activates exactly once even under concurrent requests, and stores no plaintext token', async ({
    assert,
  }) => {
    const service = new BridgePairingService()
    const grant = await service.provisionBridge(1)
    const firstToken = randomBytes(32).toString('base64url')
    const otherToken = randomBytes(32).toString('base64url')
    const results = await Promise.allSettled([
      service.activateBridge(grant.bridgeId, grant.installationToken, firstToken),
      service.activateBridge(grant.bridgeId, grant.installationToken, otherToken),
    ])
    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1)
    const successful = results.find((result) => result.status === 'fulfilled')!
    if (successful.status !== 'fulfilled') throw new Error('Activation missing')
    const row = await db
      .from('saganexus_shared_cache')
      .where('key', `registered-bridge:${grant.bridgeId}`)
      .firstOrFail()
    assert.notInclude(row.payload, grant.installationToken)
    assert.notInclude(row.payload, firstToken)
    assert.notInclude(row.payload, otherToken)
    const retainedToken = results[0].status === 'fulfilled' ? firstToken : otherToken
    const recovered = await service.activateBridge(grant.bridgeId, retainedToken, retainedToken)
    assert.equal(recovered.bridgeId, grant.bridgeId)
    await assert.rejects(() =>
      service.activateBridge(grant.bridgeId, retainedToken, 'X'.repeat(43))
    )
    await assert.rejects(() =>
      service.activateBridge(grant.bridgeId, grant.installationToken, 'X'.repeat(43))
    )
  })

  test('another account cannot authorize, inspect, or revoke the selected bridge', async ({
    assert,
  }) => {
    const service = new BridgePairingService()
    const registered = await identity(service, 1)
    const current = await service.create([mac], registered)
    const gateway = await enrollment()
    await assert.rejects(() =>
      service.authorize(current.sessionId, 2, {
        gatewayId: gateway.id,
        gatewayMac: mac,
        enrollmentCode: code,
      })
    )
    await assert.rejects(() => service.status(current.sessionId, 2))
    await assert.rejects(() => service.revokeBridge(registered.bridgeId, 2))
    assert.deepEqual(await service.status(current.sessionId, 1), { status: 'waiting' })
  })

  test('expired installation grants and expired bridge credentials fail closed', async ({
    assert,
  }) => {
    const service = new BridgePairingService()
    const grant = await service.provisionBridge(1)
    await expire(`registered-bridge:${grant.bridgeId}`)
    await assert.rejects(() =>
      service.activateBridge(grant.bridgeId, grant.installationToken, 'X'.repeat(43))
    )
    const active = await identity(service)
    await expire(`registered-bridge:${active.bridgeId}`)
    await assert.rejects(() => service.create([mac], active))
  })

  test('authorization still binds MAC and the unconsumed enrollment to the selected gateway', async ({
    assert,
  }) => {
    const gateway = await enrollment()
    const service = new BridgePairingService()
    const current = await session(service)
    const input = { gatewayId: gateway.id, gatewayMac: mac, enrollmentCode: code }
    await assert.rejects(() =>
      service.authorize(current.sessionId, 1, { ...input, gatewayMac: '00:11:22:33:44:55' })
    )
    await assert.rejects(() =>
      service.authorize(current.sessionId, 1, { ...input, gatewayId: gateway.id + 1 })
    )
    await db
      .from('gateway_enrollments')
      .where('gateway_id', gateway.id)
      .update({ claimed_at: new Date() })
    await assert.rejects(() => service.authorize(current.sessionId, 1, input))
    assert.deepEqual(await service.poll(current.sessionId, current.bridgeToken), {
      status: 'waiting',
    })
  })

  test('approves once atomically, retries delivery, and clears the enrollment on receipt', async ({
    assert,
  }) => {
    const gateway = await enrollment()
    const service = new BridgePairingService()
    const current = await session(service)
    const input = { gatewayId: gateway.id, gatewayMac: mac, enrollmentCode: code }
    const results = await Promise.allSettled([
      service.authorize(current.sessionId, 1, input),
      service.authorize(current.sessionId, 1, input),
    ])
    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1)
    for (let attempt = 0; attempt < 2; attempt++) {
      const delivery = await service.poll(current.sessionId, current.bridgeToken)
      assert.equal(delivery.enrollmentCode, code)
    }
    await service.acknowledge(current.sessionId, current.bridgeToken, 'submitted')
    await service.acknowledge(current.sessionId, current.bridgeToken, 'submitted')
    await assert.rejects(() =>
      service.acknowledge(current.sessionId, current.bridgeToken, 'failed')
    )
    const row = await db
      .from('saganexus_shared_cache')
      .where('key', `bridge-pairing:${current.sessionId}`)
      .firstOrFail()
    const payload = encryption.decrypt<Record<string, unknown>>(row.payload)!
    assert.notProperty(payload, 'enrollmentCode')
  })

  test('serializes distinct sessions per gateway and only the owning session can release it', async ({
    assert,
  }) => {
    const gateway = await enrollment()
    const service = new BridgePairingService()
    const first = await session(service)
    const second = await session(service)
    const candidates = [first, second]
    const input = { gatewayId: gateway.id, gatewayMac: mac, enrollmentCode: code }
    const results = await Promise.allSettled(candidates.map(({ sessionId }) =>
      service.authorize(sessionId, 1, input)
    ))
    const rejected = results.findIndex((result) => result.status === 'rejected')
    assert.oneOf(rejected, [0, 1])
    const failure = results[rejected] as PromiseRejectedResult
    assert.propertyVal(failure.reason, 'code', 'E_GATEWAY_CONNECTION_IN_PROGRESS')
    const winner = candidates[1 - rejected]
    const retry = candidates[rejected]
    assert.equal(results[1 - rejected].status, 'fulfilled')

    const provisioning = new GatewayProvisioningService()
    await assert.rejects(() => provisioning.renewEnrollment(gateway.id))
    await service.acknowledge(winner.sessionId, winner.bridgeToken, 'failed')
    await service.authorize(retry.sessionId, 1, input)
    await service.acknowledge(winner.sessionId, winner.bridgeToken, 'failed')
    await service.acknowledge(retry.sessionId, retry.bridgeToken, 'submitted')
    await assert.rejects(() => provisioning.renewEnrollment(gateway.id))
    const next = await session(service)
    await assert.rejects(() => service.authorize(next.sessionId, 1, input))
  })

  test('rejects approval and renewal while the gateway is online', async ({ assert }) => {
    const gateway = await enrollment()
    await gateway.merge({ status: 'online' }).save()
    const service = new BridgePairingService()
    const current = await session(service)
    const input = { gatewayId: gateway.id, gatewayMac: mac, enrollmentCode: code }
    const results = await Promise.allSettled([
      service.authorize(current.sessionId, 1, input),
      new GatewayProvisioningService().renewEnrollment(gateway.id),
    ])
    for (const result of results) {
      assert.equal(result.status, 'rejected')
      if (result.status === 'rejected') {
        assert.propertyVal(result.reason, 'code', 'E_GATEWAY_ALREADY_CONNECTED')
      }
    }
  })

  test('revocation blocks existing deliveries and new sessions immediately', async ({ assert }) => {
    const gateway = await enrollment()
    const service = new BridgePairingService()
    const active = await identity(service)
    const current = await service.create([mac], active)
    await service.authorize(current.sessionId, 1, {
      gatewayId: gateway.id,
      gatewayMac: mac,
      enrollmentCode: code,
    })
    await service.revokeBridge(active.bridgeId, 1)
    await assert.rejects(() => service.poll(current.sessionId, current.bridgeToken))
    await assert.rejects(() =>
      service.acknowledge(current.sessionId, current.bridgeToken, 'submitted')
    )
    await assert.rejects(() => service.create([mac], active))
  })

  test('session expiry blocks polling and bridge credentials renew automatically on use', async ({
    assert,
  }) => {
    const service = new BridgePairingService()
    const active = await identity(service)
    const key = `registered-bridge:${active.bridgeId}`
    const row = await db.from('saganexus_shared_cache').where('key', key).firstOrFail()
    const bridge = encryption.decrypt<Record<string, unknown>>(row.payload)!
    bridge.expiresAt = Date.now() + 60_000
    await db
      .from('saganexus_shared_cache')
      .where('key', key)
      .update({ payload: encryption.encrypt(bridge) })
    const current = await service.create([mac], active)
    const renewed = await db.from('saganexus_shared_cache').where('key', key).firstOrFail()
    assert.isAbove(new Date(renewed.expires_at).getTime() - Date.now(), 300 * 24 * 60 * 60 * 1000)
    await expire(`bridge-pairing:${current.sessionId}`)
    await assert.rejects(() => service.poll(current.sessionId, current.bridgeToken))
  })
})
