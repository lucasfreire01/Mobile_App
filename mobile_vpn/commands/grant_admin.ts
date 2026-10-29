import { BaseCommand, args } from '@adonisjs/core/ace'
import User from '#models/user'

export default class GrantAdmin extends BaseCommand {
  static commandName = 'user:grant-admin'
  static description = 'Explicitly approve an existing account for gateway administration'
  static options = { startApp: true }

  @args.string({ description: 'Email of the trusted existing account' })
  declare email: string

  async run() {
    const user = await User.query()
      .whereRaw('LOWER(email) = ?', [this.email.trim().toLowerCase()])
      .firstOrFail()
    user.isAdmin = true
    await user.save()
    this.logger.success('Account approved for gateway administration.')
  }
}
