import { test } from '@japa/runner'
import WorkerHeartbeat from '#models/worker_heartbeat'
import WorkerHeartbeatService from '#services/worker_heartbeat_service'

test.group('WorkerHeartbeatService', (group) => {
  group.each.setup(async () => {
    await WorkerHeartbeat.query().delete()
  })

  test('creates and refreshes a single heartbeat for the worker', async ({ assert }) => {
    const service = new WorkerHeartbeatService()

    await service.beat('test-worker')
    await service.beat('test-worker')

    const heartbeat = await WorkerHeartbeat.findOrFail('test-worker')
    const count = await WorkerHeartbeat.query().where('name', 'test-worker').count('* as total')

    assert.isNotNull(heartbeat.lastSeenAt)
    assert.equal(Number(count[0].$extras.total), 1)
  })
})
