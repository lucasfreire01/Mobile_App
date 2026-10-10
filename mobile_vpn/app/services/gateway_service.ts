import { Exception } from '@adonisjs/core/exceptions'

type GatewayAddress = {
  ipAddress?: string | null
}

export default class GatewayService {
  ensureHasAtLeastOneAddress(gateway: GatewayAddress) {
    if (!gateway.ipAddress) {
      throw new Exception('Missing gateway ssh ip', {
        status: 422,
        code: 'E_GATEWAY_ADDRESS_REQUIRED',
      })
    }
  }
}
