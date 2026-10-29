import User from '#models/user'
import UserTransformer from '#transformers/user_transformer'
import { createUserValidator } from '#validators/user'
import type { HttpContext } from '@adonisjs/core/http'

export default class UsersController {
  async store({ request, response }: HttpContext) {
    const payload = await request.validateUsing(createUserValidator)
    const user = await User.create({
      fullName: payload.fullName,
      email: payload.email,
      password: payload.password,
      isAdmin: payload.isAdmin ?? false,
    })

    return response.created({
      message: 'User created',
      user: UserTransformer.transform(user),
    })
  }
}
