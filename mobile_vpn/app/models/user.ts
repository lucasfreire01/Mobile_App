import { UserSchema } from '#database/schema'
import hash from '@adonisjs/core/services/hash'
import { compose } from '@adonisjs/core/helpers'
import { withAuthFinder } from '@adonisjs/auth/mixins/lucid'
import { type AccessToken, DbAccessTokensProvider } from '@adonisjs/auth/access_tokens'
import { column } from '@adonisjs/lucid/orm'

// Resolve the hash service when credentials are checked. Passing the service
// directly can capture it before its provider has completed booting in HMR.
export default class User extends compose(
  UserSchema,
  withAuthFinder(() => hash.use())
) {
  static accessTokens = DbAccessTokensProvider.forModel(User, { expiresIn: '24 hours' })
  @column()
  declare isAdmin: boolean
  declare currentAccessToken?: AccessToken

  get initials() {
    const [first, last] = this.fullName ? this.fullName.split(' ') : this.email.split('@')
    if (first && last) {
      return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase()
    }
    return `${first.slice(0, 2)}`.toUpperCase()
  }
}
