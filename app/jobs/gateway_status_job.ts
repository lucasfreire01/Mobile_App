import Gateway from '#models/gateway'
import GatewaySshService from '#services/gateway_ssh_service'
import { DateTime } from 'luxon'

export default class GatewayStatusJob {
  readonly name = 'GatewayStatusJob'

  async run() {
    const gateways = await Gateway.all()
    const sshService = new GatewaySshService()

    await Promise.allSettled(
      gateways.map(async (gateway) => {
        if (!gateway.managementIpAddress) {
          return
        }

        try {
          await sshService.ping(gateway)
          gateway.status = 'online'
          gateway.lastSeenAt = DateTime.now()

          const wanIp = await sshService.getCurrentWanIp(gateway)
          if (wanIp) {
            gateway.wanIpAddress = wanIp
            gateway.wanIpObservedAt = DateTime.now()
          }
        } catch {
          gateway.status = 'offline'
        }

        await gateway.save()
      })
    )
  }
}
