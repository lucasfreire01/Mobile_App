import { test } from '@japa/runner'
import SchedulerProvider from '#providers/scheduler_provider'
import CloudConnexaMigrationRunner from '#services/cloud_connexa_migration_runner'
import GatewayStatusJob from '#jobs/gateway_status_job'
import { SimpleIntervalJob, ToadScheduler } from 'toad-scheduler'

test.group('SchedulerProvider', (group) => {
  let originalMigrationRun: typeof CloudConnexaMigrationRunner.prototype.run
  let originalGatewayRun: typeof GatewayStatusJob.prototype.run
  let originalAdd: typeof ToadScheduler.prototype.addSimpleIntervalJob
  let originalStop: typeof ToadScheduler.prototype.stop

  group.setup(() => {
    originalMigrationRun = CloudConnexaMigrationRunner.prototype.run
    originalGatewayRun = GatewayStatusJob.prototype.run
    originalAdd = ToadScheduler.prototype.addSimpleIntervalJob
    originalStop = ToadScheduler.prototype.stop
  })

  group.teardown(() => {
    CloudConnexaMigrationRunner.prototype.run = originalMigrationRun
    GatewayStatusJob.prototype.run = originalGatewayRun
    ToadScheduler.prototype.addSimpleIntervalJob = originalAdd
    ToadScheduler.prototype.stop = originalStop
  })

  test('starts the migration and status schedule on a successful no-op', async ({ assert }) => {
    let migrationCalls = 0
    let addedJobs = 0
    CloudConnexaMigrationRunner.prototype.run = async () => {
      migrationCalls += 1
      return { status: 'skipped', migrated: 0 }
    }
    GatewayStatusJob.prototype.run = async () => ({
      skipped: false,
      checked: 0,
      offline: 0,
      writeErrors: 0,
      budgetExhausted: false,
      leaseLost: false,
    })
    ToadScheduler.prototype.addSimpleIntervalJob = function (_job: SimpleIntervalJob) {
      addedJobs += 1
    }
    ToadScheduler.prototype.stop = function () {}

    const terminating = (callback: () => Promise<void>) => {
      void callback
    }
    await new SchedulerProvider({ terminating } as never).ready()
    await new Promise((resolve) => setImmediate(resolve))

    assert.equal(migrationCalls, 1)
    assert.equal(addedJobs, 1)
  })

  test('schedules migration retry after an initial failure', async ({ assert }) => {
    let addedJobs = 0
    CloudConnexaMigrationRunner.prototype.run = async () => {
      throw new Error('temporary failure')
    }
    GatewayStatusJob.prototype.run = async () => ({
      skipped: false,
      checked: 0,
      offline: 0,
      writeErrors: 0,
      budgetExhausted: false,
      leaseLost: false,
    })
    ToadScheduler.prototype.addSimpleIntervalJob = function (_job: SimpleIntervalJob) {
      addedJobs += 1
    }
    ToadScheduler.prototype.stop = function () {}

    const terminating = (callback: () => Promise<void>) => {
      void callback
    }
    await new SchedulerProvider({ terminating } as never).ready()
    await new Promise((resolve) => setImmediate(resolve))

    assert.equal(addedJobs, 2)
  })

  test('keeps the status task error callback covered', async ({ assert }) => {
    let addedTask: { task: { errorHandler: (error: Error) => void } } | undefined
    CloudConnexaMigrationRunner.prototype.run = async () => ({ status: 'skipped', migrated: 0 })
    GatewayStatusJob.prototype.run = async () => {
      throw new Error('status failure')
    }
    ToadScheduler.prototype.addSimpleIntervalJob = function (job: SimpleIntervalJob) {
      addedTask = job as unknown as typeof addedTask
    }
    ToadScheduler.prototype.stop = function () {}

    const terminating = (callback: () => Promise<void>) => {
      void callback
    }
    await new SchedulerProvider({ terminating } as never).ready()

    assert.isDefined(addedTask)
    assert.doesNotThrow(() => addedTask!.task.errorHandler(new Error('logged status failure')))
  })
})
