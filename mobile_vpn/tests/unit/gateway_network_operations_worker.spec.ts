import { test } from '@japa/runner'
import GatewayNetworkOperationWorker from '#jobs/gateway_network_operations_worker'
import GatewayNetworkOperation from '#models/gateway_network_operation'
import WorkerHeartbeat from '#models/worker_heartbeat'
import { GATEWAY_NETWORK_OPERATIONS_WORKER } from '#services/worker_heartbeat_service'

test.group('GatewayNetworkOperationWorker', (group) => {
  group.each.setup(async () => {
    await GatewayNetworkOperation.query().delete()
    await WorkerHeartbeat.query().delete()
  })

  test('records a heartbeat even when the queue is empty', async ({ assert }) => {
    await new GatewayNetworkOperationWorker().run()

    const heartbeat = await WorkerHeartbeat.find(GATEWAY_NETWORK_OPERATIONS_WORKER)

    assert.isNotNull(heartbeat)
    assert.isNotNull(heartbeat?.lastSeenAt)
  })
})
