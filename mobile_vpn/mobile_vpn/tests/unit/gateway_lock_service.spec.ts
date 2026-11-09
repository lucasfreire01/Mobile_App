import { test } from '@japa/runner'
import { Exception } from '@adonisjs/core/exceptions'
import { DateTime } from 'luxon'
import Gateway from '#models/gateway'
import GatewayLockService from '#services/gateway_lock_service'

test.group('GatewayLockService', (group) => {
  group.each.setup(async () => {
    await Gateway.query().delete()
  })

  async function createGateway() {
    return Gateway.create({
      name: 'gateway-test',
      managementIpAddress: '10.42.0.126',
      status: 'offline',
    })
  }

  async function captureException(operation: () => Promise<unknown>) {
    try {
      await operation()
    } catch (error) {
      if (error instanceof Exception) {
        return error
      }

      throw error
    }

    throw new Error('Expected the operation to throw an Exception')
  }

  test('acquires an available lock and persists its token and expiration', async ({ assert }) => {
    const gateway = await createGateway()
    const lock = await new GatewayLockService().acquire(gateway.id)
    await gateway.refresh()

    assert.isNotEmpty(lock.token)
    assert.isTrue(lock.expiresAt > DateTime.now())
    assert.equal(gateway.networkLockToken, lock.token)
    assert.isNotNull(gateway.networkLockExpiresAt)
  })

  test('rejects a second lock for the same gateway', async ({ assert }) => {
    const gateway = await createGateway()
    const locks = new GatewayLockService()
    await locks.acquire(gateway.id)

    const error = await captureException(() => locks.acquire(gateway.id))

    assert.equal(error.status, 409)
    assert.equal(error.code, 'E_GATEWAY_NETWORK_LOCKED')
  })

  test('allows a new lock after the existing one expires', async ({ assert }) => {
    const gateway = await createGateway()
    gateway.networkLockToken = '5e9f4c53-22f4-4da9-988d-84df68caed58'
    gateway.networkLockExpiresAt = DateTime.now().minus({ minute: 1 })
    await gateway.save()

    const lock = await new GatewayLockService().acquire(gateway.id)
    await gateway.refresh()

    assert.notEqual(lock.token, '5e9f4c53-22f4-4da9-988d-84df68caed58')
    assert.equal(gateway.networkLockToken, lock.token)
  })

  test('releases a lock only when its owner supplies the matching token', async ({ assert }) => {
    const gateway = await createGateway()
    const locks = new GatewayLockService()
    const lock = await locks.acquire(gateway.id)

    await locks.release(gateway.id, 'e87f7fb8-9071-4f26-8e3b-18202cf29151')
    await gateway.refresh()
    assert.equal(gateway.networkLockToken, lock.token)

    await locks.release(gateway.id, lock.token)
    await gateway.refresh()
    assert.isNull(gateway.networkLockToken)
    assert.isNull(gateway.networkLockExpiresAt)
  })

  test('reports a missing gateway instead of treating it as locked', async ({ assert }) => {
    const error = await captureException(() => new GatewayLockService().acquire(999_999))

    assert.equal(error.status, 404)
    assert.equal(error.code, 'E_GATEWAY_NOT_FOUND')
  })
})
