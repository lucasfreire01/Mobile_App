import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import Gateway from '#models/gateway'
import GatewayNetworkOperation from '#models/gateway_network_operation'
import GatewayNetworkOperationQueueService, {
  BACKOFF_BASE_SECONDS,
  MAX_ATTEMPTS,
} from '#services/gateway_network_operation_quere_service'

test.group('GatewayNetworkOperationQueueService', (group) => {
  group.each.setup(async () => {
    await GatewayNetworkOperation.query().delete()
    await Gateway.query().delete()
  })

  async function createGateway() {
    return Gateway.create({
      name: 'gateway-test',
      managementIpAddress: '10.42.0.126',
      status: 'offline',
    })
  }

  async function createPendingOperation(gatewayId: number, availableAt = DateTime.now()) {
    return GatewayNetworkOperation.create({
      gatewayId,
      action: 'apply_dhcp',
      status: 'pending',
      attempts: 0,
      payload: { mode: 'dhcp' },
      availableAt,
    })
  }

  test('claims the oldest available pending operation', async ({ assert }) => {
    const gateway = await createGateway()
    const oldest = await createPendingOperation(gateway.id, DateTime.now().minus({ seconds: 10 }))
    await createPendingOperation(gateway.id, DateTime.now().minus({ seconds: 5 }))

    const claimed = await new GatewayNetworkOperationQueueService().claimNext()

    if (!claimed) {
      throw new Error('Expected the pending operation to be claimed')
    }

    assert.equal(claimed.operation.id, oldest.id)
    assert.equal(claimed.operation.status, 'applying')
    assert.equal(claimed.operation.attempts, 1)
    assert.isNotEmpty(claimed.processingToken)
    assert.equal(claimed.operation.processingToken, claimed.processingToken)
    assert.isNotNull(claimed.operation.startedAt)
    assert.isNotNull(claimed.operation.processingExpiresAt)
  })

  test('does not claim an operation scheduled for the future', async ({ assert }) => {
    const gateway = await createGateway()
    await createPendingOperation(gateway.id, DateTime.now().plus({ minutes: 1 }))

    const claimed = await new GatewayNetworkOperationQueueService().claimNext()

    assert.isNull(claimed)
  })

  test('skips an operation locked by another PostgreSQL transaction', async ({ assert }) => {
    const gateway = await createGateway()
    const lockedOperation = await createPendingOperation(
      gateway.id,
      DateTime.now().minus({ seconds: 10 })
    )
    const availableOperation = await createPendingOperation(
      gateway.id,
      DateTime.now().minus({ seconds: 5 })
    )
    const transaction = await db.transaction()

    try {
      await transaction
        .from('gateway_network_operations')
        .where('id', lockedOperation.id)
        .forUpdate()

      const claimed = await new GatewayNetworkOperationQueueService().claimNext()

      if (!claimed) {
        throw new Error('Expected the unlocked operation to be claimed')
      }

      assert.equal(claimed.operation.id, availableOperation.id)
      assert.notEqual(claimed.operation.id, lockedOperation.id)
    } finally {
      await transaction.rollback()
    }
  })

  test('assigns different operations to workers running at the same time', async ({ assert }) => {
    const gateway = await createGateway()
    const firstOperation = await createPendingOperation(
      gateway.id,
      DateTime.now().minus({ seconds: 10 })
    )
    const secondOperation = await createPendingOperation(
      gateway.id,
      DateTime.now().minus({ seconds: 5 })
    )

    const [firstClaim, secondClaim] = await Promise.all([
      new GatewayNetworkOperationQueueService().claimNext(),
      new GatewayNetworkOperationQueueService().claimNext(),
    ])

    if (!firstClaim || !secondClaim) {
      throw new Error('Expected both workers to claim one operation each')
    }

    assert.sameMembers(
      [firstClaim.operation.id, secondClaim.operation.id],
      [firstOperation.id, secondOperation.id]
    )
    assert.notEqual(firstClaim.processingToken, secondClaim.processingToken)
  })

  test('returns an expired lease to pending when attempts remain', async ({ assert }) => {
    const gateway = await createGateway()
    const operation = await GatewayNetworkOperation.create({
      gatewayId: gateway.id,
      action: 'apply_dhcp',
      status: 'applying',
      attempts: MAX_ATTEMPTS - 1,
      payload: { mode: 'dhcp' },
      processingToken: '5e9f4c53-22f4-4da9-988d-84df68caed58',
      processingExpiresAt: DateTime.now().minus({ minute: 1 }),
      startedAt: DateTime.now().minus({ minutes: 6 }),
    })

    const claimed = await new GatewayNetworkOperationQueueService().claimNext()
    await operation.refresh()

    if (!claimed) {
      throw new Error('Expected the expired operation to be reclaimed')
    }

    assert.equal(claimed.operation.id, operation.id)
    assert.equal(operation.status, 'applying')
    assert.equal(operation.attempts, MAX_ATTEMPTS)
    assert.equal(operation.errorCode, 'E_GATEWAY_OPERATION_LEASE_EXPIRED')
    assert.equal(operation.errorMessage, 'Worker lease expired before the operation finished.')
  })

  test('marks an expired lease as failed after the maximum attempts', async ({ assert }) => {
    const gateway = await createGateway()
    const operation = await GatewayNetworkOperation.create({
      gatewayId: gateway.id,
      action: 'apply_dhcp',
      status: 'applying',
      attempts: MAX_ATTEMPTS,
      payload: { mode: 'dhcp' },
      processingToken: '5e9f4c53-22f4-4da9-988d-84df68caed58',
      processingExpiresAt: DateTime.now().minus({ minute: 1 }),
      startedAt: DateTime.now().minus({ minutes: 6 }),
    })

    const claimed = await new GatewayNetworkOperationQueueService().claimNext()
    await operation.refresh()

    assert.isNull(claimed)
    assert.equal(operation.status, 'failed')
    assert.equal(operation.errorCode, 'E_GATEWAY_OPERATION_LEASE_EXPIRED')
    assert.equal(operation.errorMessage, 'Worker lease expired after the maximum number of attempts.')
    assert.isNotNull(operation.finishedAt)
    assert.isNull(operation.processingToken)
    assert.isNull(operation.processingExpiresAt)
  })

  test('exports retry configuration used by the worker', ({ assert }) => {
    assert.equal(MAX_ATTEMPTS, 5)
    assert.equal(BACKOFF_BASE_SECONDS, 30)
  })
})
