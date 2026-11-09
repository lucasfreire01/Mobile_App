import { BaseCommand } from '@adonisjs/core/ace'
import GatewayStatusJob from '#jobs/gateway_status_job'

const POLL_INTERVAL_MILLISECONDS = 60_000

export default class GatewayStatusWorker extends BaseCommand {
  static commandName = 'gateway:status-worker'
  static description = 'Refresh online status for provisioned gateways'
  static options = {
    startApp: true,
    staysAlive: true,
  }

  async run() {
    const job = new GatewayStatusJob({
      onProbeError: (gatewayId, error) => {
        const detail = error instanceof Error ? error.message : 'unknown error'
        this.logger.warning(`Gateway ${gatewayId} status probe failed: ${detail}`)
      },
    })
    let stopping = false
    let currentRun: Promise<void> | undefined

    const execute = async () => {
      if (stopping || currentRun) return
      currentRun = job.run().then((stats) => {
        this.logger.info(
          `Gateway status check completed: ${stats.checked} checked, ${stats.checked - stats.offline} online, ${stats.offline} offline`
        )
      })
      try {
        await currentRun
      } catch {
        this.logger.error('Gateway status check failed')
      } finally {
        currentRun = undefined
      }
    }

    await execute()
    const interval = setInterval(() => void execute(), POLL_INTERVAL_MILLISECONDS)
    this.logger.info(
      `Gateway status worker started; polling every ${POLL_INTERVAL_MILLISECONDS / 1000} seconds`
    )

    await new Promise<void>((resolve) => {
      this.app.terminating(async () => {
        stopping = true
        clearInterval(interval)
        await currentRun
        resolve()
      })
    })
  }
}
