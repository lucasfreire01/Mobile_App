import type { ApplicationService } from '@adonisjs/core/types'
import { SimpleIntervalJob, ToadScheduler, AsyncTask } from 'toad-scheduler'
import GatewayStatusJob from '#jobs/gateway_status_job'
import CloudConnexaMigrationRunner from '#services/cloud_connexa_migration_runner'
import logger from '@adonisjs/core/services/logger'

export default class SchedulerProvider {
  constructor(protected app: ApplicationService) {}

  async ready() {
    const scheduler = new ToadScheduler()

    const migrationRunner = new CloudConnexaMigrationRunner()
    const migrationTask = new AsyncTask(
      'cloudconnexa-account-migration',
      async () => {
        await migrationRunner.run()
      },
      (error: Error) =>
        logger.error(
          { event: 'cloudconnexa_account_migration_failed', errorName: error.name },
          'CloudConnexa account migration failed'
        )
    )
    void migrationRunner
      .run()
      .then((result) => {
        logger.info(
          { event: 'cloudconnexa_account_migration_finished', ...result },
          'CloudConnexa account migration finished'
        )
      })
      .catch((error: unknown) => {
        logger.error(
          {
            event: 'cloudconnexa_account_migration_failed',
            errorName: error instanceof Error ? error.name : 'UnknownError',
          },
          'CloudConnexa account migration failed'
        )
        scheduler.addSimpleIntervalJob(
          new SimpleIntervalJob({ minutes: 5, runImmediately: false }, migrationTask, {
            preventOverrun: true,
          })
        )
      })

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
