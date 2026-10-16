import Gateway from '#models/gateway'
import GatewayEthernetConfig from '#models/gateway_ethernet_config'
import { updateGatewayEthernetConfValidator } from '#validators/gateway_ethernet_config'
import type { HttpContext } from '@adonisjs/core/http'
import GatewaySshService from '#services/gateway_ssh_service'

export default class GatewayEthernetsController {
  async index({ params, response }: HttpContext) {
    const gateway = await Gateway.findOrFail(params.gateway_id)
    const ethernetConfigs = await GatewayEthernetConfig.query().where('gateway_id', gateway.id)

    return response.ok({ ethernetConfigs })
  }

  async store({ params, request, response }: HttpContext) {
    const gateway = await Gateway.findOrFail(params.gateway_id)
    const payload = await request.validateUsing(updateGatewayEthernetConfValidator)
    const existingConfig = await GatewayEthernetConfig.query()
      .where('gateway_id', gateway.id)
      .first()

    if (existingConfig) {
      return response.status(409).send({ message: 'Ethernet configuration already exists' })
    }

    const gatewaySshService = new GatewaySshService()
    await gatewaySshService.setEthernetModeDhcp(gateway)

    const ethernetConfig = await GatewayEthernetConfig.create({
      gatewayId: gateway.id,
      ...payload,
    })

    return response.created({
      message: 'Ethernet configuration created',
      ethernetConfig,
    })
  }

  async show({ params, response }: HttpContext) {
    const gateway = await Gateway.findOrFail(params.gateway_id)
    const ethernetConfig = await GatewayEthernetConfig.query()
      .where('gateway_id', gateway.id)
      .where('id', params.id)
      .firstOrFail()

    return response.ok({ ethernetConfig })
  }

  async hostname({ params, response }: HttpContext) {
    const gateway = await Gateway.findOrFail(params.id)
    const gatewaySshService = new GatewaySshService()
    const hostname = await gatewaySshService.getHostname(gateway)
    return response.ok({ hostname })
  }

  async device({ params, response }: HttpContext) {
    const gateway = await Gateway.findOrFail(params.id)
    const gatewaySshService = new GatewaySshService()
    const config = await gatewaySshService.getEthernetConfig(gateway)

    return response.ok({ config })
  }

  async update({ params, request, response }: HttpContext) {
    const gateway = await Gateway.findOrFail(params.gateway_id)
    const ethernetConfig = await GatewayEthernetConfig.query()
      .where('gateway_id', gateway.id)
      .where('id', params.id)
      .firstOrFail()
    const payload = await request.validateUsing(updateGatewayEthernetConfValidator)

    const gatewaySshService = new GatewaySshService()
    await gatewaySshService.setEthernetModeDhcp(gateway)

    ethernetConfig.merge(payload)
    await ethernetConfig.save()

    return response.ok({
      message: 'Configuração Ethernet atualizada',
      ethernetConfig,
    })
  }
}
