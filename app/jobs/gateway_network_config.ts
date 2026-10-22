import Gateway from '#models/gateway'
import CloudConnexaService from '#services/cloud_connexa_service'
import GatewaySshService from '#services/gateway_ssh_service'
import { Exception } from '@adonisjs/core/exceptions'
import { DateTime } from 'luxon'
import GatewayLockService from '#services/gateway_lock_service'
import GatewayNetworkOperation from '#models/gateway_network_operation'
import {
  MAX_ATTEMPTS,
  BACKOFF_BASE_SECONDS,
} from '#services/gateway_network_operation_quere_service'

type GatewayNetworkConfigPayload = {
  mode: 'dhcp' | 'static'
  dhcpFallbackEnabled: boolean
  staticIpAddress: string | null
  staticPrefixLength: number | null
  staticGateway: string | null
  primaryDns: string | null
  secondaryDns: string | null
}

function isGatewayNetworkConfigPayload(payload: unknown): payload is GatewayNetworkConfigPayload {
  if (!payload || typeof payload !== 'object') {
    return false
  }

  const value = payload as Record<string, unknown>

  return (
    (value.mode === 'dhcp' || value.mode === 'static') &&
    typeof value.dhcpFallbackEnabled === 'boolean' &&
    (typeof value.staticIpAddress === 'string' || value.staticIpAddress === null) &&
    (typeof value.staticPrefixLength === 'number' || value.staticPrefixLength === null) &&
    (typeof value.staticGateway === 'string' || value.staticGateway === null) &&
    (typeof value.primaryDns === 'string' || value.primaryDns === null) &&
    (typeof value.secondaryDns === 'string' || value.secondaryDns === null)
  )
}

export default class GatewayNetworkConfigJob {
  readonly name = 'GatewayNetworkConfigJob'

  constructor(
    private operationId: number,
    private processingToken: string
  ) {}

  async run() {
    const operation = await GatewayNetworkOperation.findOrFail(this.operationId)

    if (operation.status !== 'applying' || operation.processingToken !== this.processingToken) {
      throw new Exception('Gateway network operation is not owned by this worker.', {
        status: 409,
        code: 'E_GATEWAY_OPERATION_NOT_CLAIMED',
      })
    }

    const gateway = await Gateway.findOrFail(operation.gatewayId)
    const gatewayLockService = new GatewayLockService()
    const lock = await gatewayLockService.acquire(gateway.id)

    try {
      if (!isGatewayNetworkConfigPayload(operation.payload)) {
        throw new Exception('Gateway network operation has an invalid payload.', {
          status: 422,
          code: 'E_GATEWAY_OPERATION_INVALID_PAYLOAD',
        })
      }

      const payload = operation.payload

      const sshService = new GatewaySshService()

      if (payload.mode === 'dhcp') {
        await sshService.setEthernetModeDhcp(gateway)
        await this.markOperationAsApplied(operation)

        return {
          gatewayId: gateway.id,
          gatewayName: gateway.name,
          mode: payload.mode,
          dhcpFallbackEnabled: payload.dhcpFallbackEnabled,
          action: 'dhcp_applied',
          reconnectionExpected: true,
        }
      }

      if (
        !payload.staticIpAddress ||
        payload.staticPrefixLength === null ||
        !payload.staticGateway
      ) {
        throw new Exception('Static Ethernet configuration is incomplete.', {
          status: 422,
          code: 'E_GATEWAY_STATIC_CONFIG_INCOMPLETE',
        })
      }

      const currentAddress = sshService.ensureConnectionAddress(gateway)
      const nextAddress = payload.staticIpAddress
      const cloudConnexa = new CloudConnexaService()

      if (currentAddress !== nextAddress) {
        if (!gateway.ccIpServiceId) {
          throw new Exception('Gateway has no CloudConnexa IP service.', {
            status: 422,
            code: 'E_GATEWAY_NO_IP_SERVICE',
          })
        }

        await cloudConnexa.updateIpServiceRoutes(gateway.ccIpServiceId, [
          currentAddress,
          nextAddress,
        ])
      }

      await sshService.setEthernetModeStatic(gateway, {
        ipAddress: nextAddress,
        prefixLength: payload.staticPrefixLength,
        gateway: payload.staticGateway,
        primaryDns: payload.primaryDns,
        secondaryDns: payload.secondaryDns,
      })

      await sshService.waitForConnection(nextAddress)

      gateway.managementIpAddress = nextAddress
      gateway.wanIpAddress = nextAddress
      gateway.wanIpObservedAt = DateTime.now()
      gateway.status = 'online'
      gateway.lastSeenAt = DateTime.now()
      await gateway.save()

      if (gateway.ccIpServiceId && currentAddress !== nextAddress) {
        await cloudConnexa.updateIpServiceRoutes(gateway.ccIpServiceId, [nextAddress])
      }

      await this.markOperationAsApplied(operation)

      return {
        gatewayId: gateway.id,
        gatewayName: gateway.name,
        mode: payload.mode,
        dhcpFallbackEnabled: payload.dhcpFallbackEnabled,
        action: 'static_applied',
        managementIpAddress: nextAddress,
      }
    } catch (error) {
      await this.markOperationAsFailed(operation, error)

      throw error
    } finally {
      await gatewayLockService.release(gateway.id, lock.token)
    }
  }
  private shouldRetry(error: unknown) {
    return error instanceof Exception && error.status >= 500
  }

  private async markOperationAsApplied(operation: GatewayNetworkOperation) {
    operation.status = 'applied'
    operation.finishedAt = DateTime.now()
    operation.errorCode = null
    operation.errorMessage = null
    operation.processingToken = null
    operation.processingExpiresAt = null
    operation.availableAt = null
    await operation.save()
  }

  private async markOperationAsFailed(operation: GatewayNetworkOperation, error: unknown) {
    const errorCode =
      error instanceof Exception && typeof error.code === 'string'
        ? error.code
        : 'E_GATEWAY_NETWORK_CONFIG_FAILED'

    const errorMessage = error instanceof Error ? error.message : 'Unexpected error.'

    operation.errorCode = errorCode
    operation.errorMessage = errorMessage
    operation.processingToken = null
    operation.processingExpiresAt = null

    if (this.shouldRetry(error) && operation.attempts < MAX_ATTEMPTS) {
      const retryDelay = BACKOFF_BASE_SECONDS * 2 ** (operation.attempts - 1)

      operation.status = 'pending'
      operation.availableAt = DateTime.now().plus({ seconds: retryDelay })
      operation.startedAt = null
      operation.finishedAt = null
      await operation.save()

      return
    }

    operation.status = 'failed'
    operation.availableAt = null
    operation.finishedAt = DateTime.now()
    await operation.save()
  }
}
