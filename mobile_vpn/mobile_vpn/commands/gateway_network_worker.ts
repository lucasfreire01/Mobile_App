import { BaseCommand } from '@adonisjs/core/ace'
import GatewayNetworkOperationWorker from '#jobs/gateway_network_operations_worker'

const POLL_INTERVAL_MILLISECONDS = 10_000

export default class GatewayNetworkWorker extends BaseCommand {
  static commandName = 'gateway:network-worker'
  static description = 'Process queued gateway network operations'
  static options = {
    startApp: true,
    staysAlive: true,
  }

  async run() {
    const worker = new GatewayNetworkOperationWorker()
    let stopping = false
    let currentRun: Promise<void> | undefined

    const execute = async () => {
      if (stopping || currentRun) {
        return
      }

      currentRun = worker.run()

      try {
        await currentRun
      } catch {
        this.logger.error('Gateway network worker cycle failed')
      } finally {
        currentRun = undefined
      }
    }

    await execute()

    const interval = setInterval(() => {
      void execute()
    }, POLL_INTERVAL_MILLISECONDS)

    this.logger.info(
      `Gateway network worker started; polling every ${POLL_INTERVAL_MILLISECONDS / 1000} seconds`
    )

    await new Promise<void>((resolve) => {
      this.app.terminating(async () => {
        stopping = true
        clearInterval(interval)
        await currentRun
        this.logger.info('Gateway network worker stopped')
        resolve()
      })
    })
  }
}
