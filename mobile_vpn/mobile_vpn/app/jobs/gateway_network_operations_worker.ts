import GatewayNetworkConfigJob from '#jobs/gateway_network_config'
import GatewayNetworkOperationQueueService from '#services/gateway_network_operation_quere_service'
import WorkerHeartbeatService, {
  GATEWAY_NETWORK_OPERATIONS_WORKER,
} from '#services/worker_heartbeat_service'
import { Exception } from '@adonisjs/core/exceptions'
import logger from '@adonisjs/core/services/logger'

const WORKER_CONCURRENCY = 5

export default class GatewayNetworkOperationWorker {
  readonly name = 'GatewayNetworkOperationWorker'

  async run() {
    await new WorkerHeartbeatService().beat(GATEWAY_NETWORK_OPERATIONS_WORKER)

    const results = await Promise.allSettled(
      Array.from({ length: WORKER_CONCURRENCY }, () => this.processOne())
    )

    for (const result of results) {
      if (result.status === 'rejected') {
        const errorCode =
          result.reason instanceof Exception && typeof result.reason.code === 'string'
            ? result.reason.code
            : 'E_GATEWAY_NETWORK_WORKER_FAILED'

        logger.error(
          {
            event: 'gateway_network_worker_failed',
            worker: this.name,
            errorCode,
          },
          'Gateway network worker execution failed'
        )
      }
    }
  }

  private async processOne() {
    const queueService = new GatewayNetworkOperationQueueService()
    const claimedOperation = await queueService.claimNext()

    if (!claimedOperation) {
      return
    }

    logger.info(
      {
        event: 'gateway_network_operation_claimed',
        operationId: claimedOperation.operation.id,
        gatewayId: claimedOperation.operation.gatewayId,
        action: claimedOperation.operation.action,
        attempt: claimedOperation.operation.attempts,
      },
      'Gateway network operation claimed'
    )

    const job = new GatewayNetworkConfigJob(
      claimedOperation.operation.id,
      claimedOperation.processingToken
    )

    await job.run()
  }
}
