import User from '#models/user'
import env from '#start/env'

export default class CreateDevelopmentUserSeeder {
  async run() {
    const email = env.get('SEED_ADMIN_EMAIL').toLowerCase()
    const password = env.get('SEED_ADMIN_PASSWORD').release()

    await User.updateOrCreate(
      { email },
      {
        email,
        fullName: 'Administrador de desenvolvimento',
        password,
      }
    )
  }
}
