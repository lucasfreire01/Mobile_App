import Gateway from '#models/gateway'
import GatewayEthernetConfig from '#models/gateway_ethernet_config'
import { updateGatewayEthernetConfValidator } from '#validators/gateway_ethernet_config'
import { HttpContext } from '@adonisjs/core/http'
import GatewaySshService from '#services/gateway_ssh_service'

export default class GatewayEthernetsController {
  async show({ params, response }: HttpContext) {
    const gateway = await Gateway.query()
      .where('id', params.id)
      .preload('ethernetConfig')
      .firstOrFail()

    return response.ok({
      ethernetConfig: gateway.ethernetConfig,
    })
  }
  async hostname({ params, response }: HttpContext) {
    const gateway = await Gateway.findByOrFail(params.id)
    const gatewaySshService = new GatewaySshService()
    const hostname = await gatewaySshService.getHostname(gateway)
    return response.ok({ hostname })
  }

  async update({ params, request, response }: HttpContext) {
    const gateway = await Gateway.findOrFail(params.id)
    const payload = await request.validateUsing(updateGatewayEthernetConfValidator)

    const ethernetConfig = await GatewayEthernetConfig.updateOrCreate(
      { gatewayId: gateway.id },
      payload
    )

    return response.ok({
      message: 'Configuração Ethernet atualizada',
      ethernetConfig,
    })
  }
}
