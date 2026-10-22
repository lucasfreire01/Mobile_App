import GatewayNetworkConfigJob from '#jobs/gateway_network_config'
import GatewayNetworkOperationQueueService from '#services/gateway_network_operation_quere_service'

export default class GatewayNetworkOperationWorker {
  readonly name = 'GatewayNetworkOperationWorker'

  async run() {
    const queueService = new GatewayNetworkOperationQueueService()
    const claimedOperation = await queueService.claimNext()

    if (!claimedOperation) {
      return
    }

    const job = new GatewayNetworkConfigJob(
      claimedOperation.operation.id,
      claimedOperation.processingToken
    )

    await job.run()
  }
}
