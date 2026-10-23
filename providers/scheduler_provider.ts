import type { ApplicationService } from '@adonisjs/core/types'
import { SimpleIntervalJob, ToadScheduler, AsyncTask } from 'toad-scheduler'
import GatewayStatusJob from '#jobs/gateway_status_job'
import GatewayNetworkOperationWorker from '#jobs/gateway_network_operations_worker'
import logger from '@adonisjs/core/services/logger'

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
        logger.error(
          {
            event: 'gateway_network_worker_scheduler_failed',
            worker: gatewayNetworkOperationWorker.name,
            errorName: err.name,
          },
          'Gateway network worker scheduler task failed'
        )
      }
    )

    const workerJob = new SimpleIntervalJob({ seconds: 10, runImmediately: true }, workerTask)

    scheduler.addSimpleIntervalJob(workerJob)

    logger.info(
      {
        event: 'gateway_network_worker_scheduled',
        intervalSeconds: 10,
      },
      'Gateway network worker scheduled'
    )

    const task = new AsyncTask(
      gatewayStatusJob.name,
      async () => {
        await gatewayStatusJob.run()
      },
      (err: Error) => {
        logger.error(
          {
            event: 'gateway_status_scheduler_failed',
            job: gatewayStatusJob.name,
            errorName: err.name,
          },
          'Gateway status scheduler task failed'
        )
      }
    )

    // Runs every 2 minutes
    const job = new SimpleIntervalJob({ minutes: 2, runImmediately: true }, task)

    scheduler.addSimpleIntervalJob(job)

    logger.info(
      {
        event: 'gateway_status_job_scheduled',
        intervalSeconds: 120,
      },
      'Gateway status job scheduled'
    )

    // Gracefully stop scheduler on app shutdown
    this.app.terminating(async () => {
      scheduler.stop()
    })
  }
}
