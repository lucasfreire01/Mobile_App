import Gateway from '#models/gateway'
import GatewayEthernetConfig from '#models/gateway_ethernet_config'
import { updateGatewayEthernetConfValidator } from '#validators/gateway_ethernet_config'
import type { HttpContext } from '@adonisjs/core/http'
import GatewaySshService from '#services/gateway_ssh_service'
import GatewayNetworkOperation from '#models/gateway_network_operation'
import { DateTime } from 'luxon'

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

    const ethernetConfig = await GatewayEthernetConfig.create({
      gatewayId: gateway.id,
      ...payload,
    })

    return response.created({
      message: 'Ethernet configuration saved',
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

  async apply({ params, response }: HttpContext) {
    const gateway = await Gateway.findOrFail(params.id)

    const ethernetConfig = await GatewayEthernetConfig.query()
      .where('gateway_id', gateway.id)
      .firstOrFail()

    const operationInProgress = await GatewayNetworkOperation.query()
      .where('gateway_id', gateway.id)
      .whereIn('status', ['pending', 'applying'])
      .first()

    if (operationInProgress) {
      return response.conflict({
        message: 'Gateway already has a network operation in progress.',
      })
    }

    const operation = await GatewayNetworkOperation.create({
      gatewayId: gateway.id,
      action: ethernetConfig.mode === 'dhcp' ? 'apply_dhcp' : 'apply_static',
      status: 'pending',
      attempts: 0,
      availableAt: DateTime.now(),
      payload: {
        mode: ethernetConfig.mode,
        dhcpFallbackEnabled: ethernetConfig.dhcpFallbackEnabled,
        staticIpAddress: ethernetConfig.staticIpAddress,
        staticPrefixLength: ethernetConfig.staticPrefixLength,
        staticGateway: ethernetConfig.staticGateway,
        primaryDns: ethernetConfig.primaryDns,
        secondaryDns: ethernetConfig.secondaryDns,
      },
    })

    return response.accepted({
      message: 'Ethernet configuration queued.',
      operation,
    })
  }

  async update({ params, request, response }: HttpContext) {
    const gateway = await Gateway.findOrFail(params.gateway_id)
    const ethernetConfig = await GatewayEthernetConfig.query()
      .where('gateway_id', gateway.id)
      .where('id', params.id)
      .firstOrFail()
    const payload = await request.validateUsing(updateGatewayEthernetConfValidator)

    ethernetConfig.merge(payload)
    await ethernetConfig.save()

    return response.ok({
      message: 'Ethernet configuration saved',
      ethernetConfig,
    })
  }
}
