import Gateway from '#models/gateway'
import GatewaySecurityAlert from '#models/gateway_security_alert'
import { Exception } from '@adonisjs/core/exceptions'
import type { HttpContext } from '@adonisjs/core/http'
import { DateTime } from 'luxon'

const DEFAULT_ALERTS_LIMIT = 20
const MAX_ALERTS_LIMIT = 100

function parsePaginationParameter(value: unknown, fallback: number, maximum: number) {
  const parsed = Number(value)

  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    return fallback
  }

  return Math.min(parsed, maximum)
}

export default class GatewaySecurityAlertsController {
  async index({ params, request, response }: HttpContext) {
    const gateway = await Gateway.findOrFail(params.id)
    const page = parsePaginationParameter(request.input('page'), 1, Number.MAX_SAFE_INTEGER)
    const limit = parsePaginationParameter(
      request.input('limit'),
      DEFAULT_ALERTS_LIMIT,
      MAX_ALERTS_LIMIT
    )
    const alerts = await GatewaySecurityAlert.query()
      .where('gateway_id', gateway.id)
      .orderBy('created_at', 'desc')
      .paginate(page, limit)

    alerts.baseUrl(`/api/v1/gateways/${gateway.id}/security-alerts`).queryString({ limit })

    return response.ok({ alerts: alerts.all(), meta: alerts.getMeta() })
  }

  async acknowledge({ auth, params, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const alert = await GatewaySecurityAlert.query()
      .where('gateway_id', params.id)
      .where('id', params.alertId)
      .firstOrFail()

    if (alert.status !== 'open') {
      throw new Exception('Gateway security alert is already acknowledged.', {
        status: 409,
        code: 'E_GATEWAY_SECURITY_ALERT_ALREADY_ACKNOWLEDGED',
      })
    }

    alert.status = 'acknowledged'
    alert.acknowledgedByUserId = user.id
    alert.acknowledgedByEmail = user.email
    alert.acknowledgedAt = DateTime.now()
    await alert.save()

    return response.ok({ message: 'Gateway security alert acknowledged.', alert })
  }
}
