import type { ApplicationService } from '@adonisjs/core/types'
import { SimpleIntervalJob, ToadScheduler, AsyncTask } from 'toad-scheduler'
import GatewayStatusJob from '#jobs/gateway_status_job'
import GatewayNetworkOperationWorker from '#jobs/gateway_network_operations_worker'

export default class SchedulerProvider {
  constructor(protected app: ApplicationService) {}

  async ready() {
    const scheduler = new ToadScheduler()

    const gatewayStatusJob = new GatewayStatusJob()
    const gatewayNetworkOperationWorker = new GatewayNetworkOperationWorker()

    const workerTask = new AsyncTask(
      gatewayNetworkOperationWorker.name,
      async () => {
        await gatewayNetworkOperationWorker.run()
      },
      (err: Error) => {
        console.error(`[${gatewayNetworkOperationWorker.name}] Error:`, err.message)
      }
    )

    const workerJob = new SimpleIntervalJob({ seconds: 10, runImmediately: true }, workerTask)

    scheduler.addSimpleIntervalJob(workerJob)

    console.log('[Scheduler] GatewayNetworkOperationWorker scheduled (every 10 seconds)')

    const task = new AsyncTask(
      gatewayStatusJob.name,
      async () => {
        await gatewayStatusJob.run()
      },
      (err: Error) => {
        console.error(`[${gatewayStatusJob.name}] Error:`, err.message)
      }
    )

    // Runs every 2 minutes
    const job = new SimpleIntervalJob({ minutes: 2, runImmediately: true }, task)

    scheduler.addSimpleIntervalJob(job)

    console.log('[Scheduler] GatewayStatusJob scheduled (every 2 minutes)')

    // Gracefully stop scheduler on app shutdown
    this.app.terminating(async () => {
      scheduler.stop()
    })
  }
}
