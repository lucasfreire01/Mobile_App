import { BaseCommand, args } from '@adonisjs/core/ace'
import BridgePairingService from '#services/bridge_pairing_service'

export default class BridgeProvisionInstallation extends BaseCommand {
  static commandName = 'bridge:provision-installation'
  static description = 'Emite uma credencial temporária para instalar uma ponte Linux'
  static options = { startApp: true }

  @args.string({ description: 'ID numérico do usuário administrador' })
  declare userId: string

  async run() {
    const userId = Number(this.userId)
    if (!Number.isSafeInteger(userId) || userId <= 0) this.error('O userId deve ser um inteiro positivo.')
    const grant = await new BridgePairingService().provisionBridge(userId)
    process.stdout.write(`${JSON.stringify(grant)}\n`)
  }
}
