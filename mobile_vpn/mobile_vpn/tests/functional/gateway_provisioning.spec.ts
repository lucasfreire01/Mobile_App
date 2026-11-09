import { test } from '@japa/runner'
import { Exception } from '@adonisjs/core/exceptions'
import db from '@adonisjs/lucid/services/db'
import Gateway from '#models/gateway'
import User from '#models/user'
import CloudConnexaService from '#services/cloud_connexa_service'
import GatewayProvisioningService from '#services/gateway_provisioning_service'

test.group('Atomic gateway provisioning', (group) => {
  let authorization: string
  let created: number
  let deleted: string[]
  async function gatewayCount() {
    const rows = await Gateway.all()
    return rows.length
  }
  async function reservationCount() {
    const rows = await db.from('gateway_ip_reservations')
    return rows.length
  }
  const originalCreate = CloudConnexaService.prototype.createGatewayResources
  const originalDelete = CloudConnexaService.prototype.deleteNetwork
  group.each.setup(async () => {
    await db.from('gateway_ip_reservations').delete()
    await Gateway.query().delete()
    const user = await User.create({
      email: `provision-${Date.now()}@example.test`,
      password: 'test-password-123',
      isAdmin: true,
    })
    const token = await User.accessTokens.create(user)
    authorization = `Bearer ${token.value!.release()}`
    created = 0
    deleted = []
    CloudConnexaService.prototype.createGatewayResources = async (_name, _ip, onCreated) => {
      const networkId = `network-${++created}`
      await onCreated?.(networkId)
      return { networkId, connectorId: `connector-${created}`, ipServiceId: `service-${created}` }
    }
    CloudConnexaService.prototype.deleteNetwork = async (id) => {
      deleted.push(id)
    }
    return async () => {
      CloudConnexaService.prototype.createGatewayResources = originalCreate
      CloudConnexaService.prototype.deleteNetwork = originalDelete
      await db.from('gateway_ip_reservations').delete()
    }
  })

  test('allows one explicit IP reservation and rejects the concurrent request before provisioning', async ({
    client,
    assert,
  }) => {
    let entered!: () => void
    let release!: () => void
    const started = new Promise<void>((resolve) => {
      entered = resolve
    })
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    CloudConnexaService.prototype.createGatewayResources = async (_name, _ip, onCreated) => {
      created++
      await onCreated?.('network-1')
      entered()
      await gate
      return { networkId: 'network-1', connectorId: 'connector-1', ipServiceId: 'service-1' }
    }
    const first = client
      .post('/api/v1/gateways')
      .header('authorization', authorization)
      .json({ name: 'first', managementIpAddress: '10.42.0.30' })
      .then((response) => response)
    try {
      await started
      const second = await client
        .post('/api/v1/gateways')
        .header('authorization', authorization)
        .json({ name: 'second', managementIpAddress: '10.42.0.30' })
      second.assertStatus(409)
      assert.equal(created, 1)
    } finally {
      release()
    }
    const firstResponse = await first
    firstResponse.assertStatus(201)
    assert.equal(await gatewayCount(), 1)
    assert.equal(await reservationCount(), 0)
  })

  test('allocates different automatic IPs to simultaneous requests', async ({ client, assert }) => {
    const responses = await Promise.all(
      ['one', 'two'].map((name) =>
        client.post('/api/v1/gateways').header('authorization', authorization).json({ name })
      )
    )
    for (const response of responses) response.assertStatus(201)
    assert.equal(
      new Set(
        responses.map(
          (response) =>
            (response.body() as { gateway: { managementIpAddress: string } }).gateway
              .managementIpAddress
        )
      ).size,
      2
    )
  })

  test('enforces uniqueness in PostgreSQL independently of API prechecks', async ({ assert }) => {
    await Gateway.create({ name: 'existing', managementIpAddress: '10.42.0.40' })
    await assert.rejects(
      () => Gateway.create({ name: 'duplicate', managementIpAddress: '10.42.0.40' }),
      /duplicate key/
    )
  })

  test('returns 409 for an update to an occupied or reserved IP', async ({ client }) => {
    const existing = await Gateway.create({ name: 'existing', managementIpAddress: '10.42.0.40' })
    const other = await Gateway.create({ name: 'other', managementIpAddress: '10.42.0.41' })
    const occupied = await client
      .put(`/api/v1/gateways/${other.id}`)
      .header('authorization', authorization)
      .json({ name: 'other', managementIpAddress: existing.managementIpAddress })
    occupied.assertStatus(409)
    await db.table('gateway_ip_reservations').insert({
      management_ip_address: '10.42.0.42',
      token: '8fc1ab0c-95bd-49b8-98f6-9afb5a593ce4',
    })
    const reserved = await client
      .put(`/api/v1/gateways/${other.id}`)
      .header('authorization', authorization)
      .json({ name: 'other', managementIpAddress: '10.42.0.42' })
    reserved.assertStatus(409)
  })

  test('deletes partial remote resources and releases the IP on provider failure', async ({
    client,
    assert,
  }) => {
    CloudConnexaService.prototype.createGatewayResources = async (_name, _ip, onCreated) => {
      await onCreated?.('partial-network')
      throw new Exception('Provider failure', { status: 502, code: 'E_CLOUDCONNEXA_500' })
    }
    const response = await client
      .post('/api/v1/gateways')
      .header('authorization', authorization)
      .json({ name: 'partial', managementIpAddress: '10.42.0.50' })
    response.assertStatus(502)
    assert.deepEqual(deleted, ['partial-network'])
    assert.equal(await gatewayCount(), 0)
    assert.equal(await reservationCount(), 0)
  })

  test('compensates remote creation when final database persistence fails', async ({
    client,
    assert,
  }) => {
    await Gateway.create({
      name: 'existing',
      managementIpAddress: '10.42.0.60',
      gatewayEui: '0011223344556677',
    })
    const response = await client
      .post('/api/v1/gateways')
      .header('authorization', authorization)
      .json({
        name: 'duplicate-eui',
        managementIpAddress: '10.42.0.61',
        gatewayEui: '0011223344556677',
      })
    response.assertStatus(500)
    assert.deepEqual(deleted, ['network-1'])
    assert.equal(await gatewayCount(), 1)
    assert.equal(await reservationCount(), 0)
  })

  test('retains a failed cleanup durably, blocks reuse and supports a later retry', async ({
    client,
    assert,
  }) => {
    CloudConnexaService.prototype.createGatewayResources = async (_name, _ip, onCreated) => {
      await onCreated?.('pending-network')
      throw new Error('failed provisioning')
    }
    CloudConnexaService.prototype.deleteNetwork = async () => {
      throw new Error('cleanup unavailable')
    }
    const payload = { name: 'pending-cleanup', managementIpAddress: '10.42.0.70' }
    const failed = await client
      .post('/api/v1/gateways')
      .header('authorization', authorization)
      .json(payload)
    failed.assertStatus(503)
    const reservation = await db.from('gateway_ip_reservations').firstOrFail()
    assert.equal(reservation.status, 'cleanup_required')
    assert.equal(reservation.network_id, 'pending-network')
    const blocked = await client
      .post('/api/v1/gateways')
      .header('authorization', authorization)
      .json(payload)
    blocked.assertStatus(409)
    CloudConnexaService.prototype.deleteNetwork = async (id) => {
      deleted.push(id)
    }
    assert.isTrue(await new GatewayProvisioningService().retryCleanup(reservation.id))
    assert.deepEqual(deleted, ['pending-network'])
    assert.equal(await reservationCount(), 0)
  })

  test('keeps an ambiguous outcome reserved instead of blindly repeating the POST', async ({
    client,
    assert,
  }) => {
    CloudConnexaService.prototype.createGatewayResources = async () => {
      throw new Error('lost response')
    }
    const response = await client
      .post('/api/v1/gateways')
      .header('authorization', authorization)
      .json({ name: 'unknown', managementIpAddress: '10.42.0.80' })
    response.assertStatus(503)
    const reservation = await db.from('gateway_ip_reservations').firstOrFail()
    assert.equal(reservation.status, 'reconciliation_required')
    assert.deepEqual(deleted, [])
  })

  test('releases the reservation after a definitive provider rejection', async ({
    client,
    assert,
  }) => {
    CloudConnexaService.prototype.createGatewayResources = async () => {
      throw new Exception('Rejected', { status: 502, code: 'E_CLOUDCONNEXA_400' })
    }
    const response = await client
      .post('/api/v1/gateways')
      .header('authorization', authorization)
      .json({ name: 'rejected', managementIpAddress: '10.42.0.90' })
    response.assertStatus(502)
    assert.equal(await reservationCount(), 0)
  })
})
