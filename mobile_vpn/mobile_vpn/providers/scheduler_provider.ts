import type { ApplicationService } from '@adonisjs/core/types'
import { SimpleIntervalJob, ToadScheduler, AsyncTask } from 'toad-scheduler'
import GatewayStatusJob from '#jobs/gateway_status_job'
import logger from '@adonisjs/core/services/logger'

export default class SchedulerProvider {
  constructor(protected app: ApplicationService) {}

  async ready() {
    const scheduler = new ToadScheduler()

    const gatewayStatusJob = new GatewayStatusJob()
    const task = new AsyncTask(
      gatewayStatusJob.name,
      async () => {
        const result = await gatewayStatusJob.run()
        logger.info({ event: 'gateway_status_cycle', ...result }, 'Gateway status cycle completed')
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
    const job = new SimpleIntervalJob({ minutes: 2, runImmediately: true }, task, {
      preventOverrun: true,
    })

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
