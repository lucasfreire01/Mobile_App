import Gateway from '#models/gateway'
import GatewayService from '#services/gateway_service'
import { createGatewayValidator } from '#validators/gateway'
import type { HttpContext } from '@adonisjs/core/http'

export default class GatewaysController {
  /**
   * Display a list of resource
   */
  async index({ response }: HttpContext) {
    const gatewaysList = await Gateway.all()

    return response.ok({
      message: 'gateway_list',
      gatewaysList,
    })
  }

  /**
   * Display form to create a new record
   */
  async store({ request, response }: HttpContext) {
    const payload = await request.validateUsing(createGatewayValidator)
    const gatewayService = new GatewayService()

    gatewayService.ensureHasAtLeastOneAddress(payload)

    const gateway = await Gateway.create(payload)

    return response.ok({ message: 'gateway created', gateway })
  }
  async show({ params, response }: HttpContext) {
    const gateway = await Gateway.findOrFail(params.id)

    return response.ok({
      gateway,
    })
  }
  async edit() {}

  /**
   * Handle form submission for the edit action
   */
  async update({ params, request, response }: HttpContext) {
    const gatewayUpdate = await Gateway.findOrFail(params.id)
    const payload = await request.validateUsing(createGatewayValidator)

    gatewayUpdate.merge(payload)
    await gatewayUpdate.save()

    return response.ok({
      message: 'Gateway updated',
      gateway: gatewayUpdate,
    })
  }

  /**
   * Delete record
   */
  async destroy({ params, response }: HttpContext) {
    const gateway = await Gateway.findOrFail(params.id)

    await gateway.delete()

    return response.noContent()
  }
}
