import { BaseCommand } from '@adonisjs/core/ace'
import db from '@adonisjs/lucid/services/db'
import GatewayProvisioningService from '#services/gateway_provisioning_service'

export default class GatewayProvisioningCleanup extends BaseCommand {
  static commandName = 'gateway:provisioning-cleanup'
  static description = 'Retry deletion of recorded failed gateway provisioning resources'
  static options = { startApp: true }

  async run() {
    const pending = await db
      .from('gateway_ip_reservations')
      .where('status', 'cleanup_required')
      .select('id')
    const service = new GatewayProvisioningService()
    for (const { id } of pending) {
      try {
        await service.retryCleanup(id)
      } catch {
        this.logger.error(`Reservation ${id}: cleanup still pending; IP remains reserved.`)
        this.exitCode = 1
      }
    }
  }
}
