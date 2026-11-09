import type GatewayNetworkOperation from '#models/gateway_network_operation'
import GatewaySecurityAlert from '#models/gateway_security_alert'

export const SSH_HOST_KEY_MISMATCH_ALERT = 'ssh_host_key_mismatch'

export default class GatewaySecurityAlertService {
  async openSshHostKeyMismatch(operation: GatewayNetworkOperation) {
    const existing = await GatewaySecurityAlert.query().where('operation_id', operation.id).first()

    if (existing) {
      return existing
    }

    return GatewaySecurityAlert.create({
      gatewayId: operation.gatewayId,
      operationId: operation.id,
      type: SSH_HOST_KEY_MISMATCH_ALERT,
      status: 'open',
      message: 'Gateway SSH host key does not match the pinned fingerprint.',
    })
  }
}
