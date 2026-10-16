import type { ApplicationService } from '@adonisjs/core/types'
import { SimpleIntervalJob, ToadScheduler, AsyncTask } from 'toad-scheduler'
import GatewayStatusJob from '#jobs/gateway_status_job'

export default class SchedulerProvider {
  constructor(protected app: ApplicationService) {}

  async ready() {

    const scheduler = new ToadScheduler()

    const gatewayStatusJob = new GatewayStatusJob()

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
