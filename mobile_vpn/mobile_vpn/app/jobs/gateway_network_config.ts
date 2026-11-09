import Gateway from '#models/gateway'
import { resolveVpnProvider, gatewayVpnResources } from '#services/vpn/registry'
import type { VpnProvider } from '#services/vpn/types'
import GatewaySshService from '#services/gateway_ssh_service'
import { STATIC_ROLLBACK_TIMEOUT_SECONDS } from '#services/gateway_network_command_builder'
import { Exception } from '@adonisjs/core/exceptions'
import { DateTime } from 'luxon'
import GatewayLockService from '#services/gateway_lock_service'
import GatewayNetworkOperation from '#models/gateway_network_operation'
import GatewaySecurityAlertService from '#services/gateway_security_alert_service'
import {
  MAX_ATTEMPTS,
  BACKOFF_BASE_SECONDS,
} from '#services/gateway_network_operation_quere_service'
import logger from '@adonisjs/core/services/logger'

const STATIC_ROLLBACK_RETRY_DELAY_SECONDS = STATIC_ROLLBACK_TIMEOUT_SECONDS + BACKOFF_BASE_SECONDS
const NON_RETRYABLE_ERROR_CODES = new Set([
  'E_GATEWAY_SSH_HOST_KEY_MISMATCH',
  'E_VPN_PROVIDER_NOT_CONFIGURED',
  'E_VPN_PROVIDER_INVALID',
])

type GatewayNetworkConfigPayload = {
  mode: 'dhcp' | 'static'
  dhcpFallbackEnabled: boolean
  staticIpAddress: string | null
  staticPrefixLength: number | null
  staticGateway: string | null
  primaryDns: string | null
  secondaryDns: string | null
}

export type GatewayNetworkConfigJobDependencies = {
  gatewayLockService?: Pick<GatewayLockService, 'acquire' | 'release'>
  gatewaySshService?: Pick<
    GatewaySshService,
    | 'configureDhcpFallback'
    | 'armStaticRollback'
    | 'cancelStaticRollback'
    | 'disableDhcpFallback'
    | 'disableDhcpFallbackAtAddress'
    | 'ensureConnectionAddress'
    | 'setEthernetModeDhcp'
    | 'setEthernetModeStatic'
    | 'waitForConnection'
    | 'getEthernetConfig'
  >
  vpnProvider?: Pick<VpnProvider, 'updateRoutes'>
}

function parseGatewayNetworkConfigPayload(payload: unknown): GatewayNetworkConfigPayload | null {
  let value: unknown = payload

  if (typeof value === 'string') {
    try {
      value = JSON.parse(value)
    } catch {
      return null
    }
  }

  if (!value || typeof value !== 'object') {
    return null
  }

  const config = value as Record<string, unknown>

  if (
    (config.mode !== 'dhcp' && config.mode !== 'static') ||
    typeof config.dhcpFallbackEnabled !== 'boolean' ||
    (typeof config.staticIpAddress !== 'string' && config.staticIpAddress !== null) ||
    (typeof config.staticPrefixLength !== 'number' && config.staticPrefixLength !== null) ||
    (typeof config.staticGateway !== 'string' && config.staticGateway !== null) ||
    (typeof config.primaryDns !== 'string' && config.primaryDns !== null) ||
    (typeof config.secondaryDns !== 'string' && config.secondaryDns !== null)
  ) {
    return null
  }

  return config as GatewayNetworkConfigPayload
}

export default class GatewayNetworkConfigJob {
  readonly name = 'GatewayNetworkConfigJob'

  constructor(
    private operationId: number,
    private processingToken: string,
    private dependencies: GatewayNetworkConfigJobDependencies = {}
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
    const gatewayLockService = this.dependencies.gatewayLockService ?? new GatewayLockService()
    const lock = await gatewayLockService.acquire(gateway.id)
    let staticRollbackArmed = false

    logger.info(
      {
        event: 'gateway_network_operation_started',
        operationId: operation.id,
        gatewayId: gateway.id,
        action: operation.action,
        attempt: operation.attempts,
      },
      'Gateway network operation started'
    )

    try {
      const payload = parseGatewayNetworkConfigPayload(operation.payload)

      if (!payload) {
        throw new Exception('Gateway network operation has an invalid payload.', {
          status: 422,
          code: 'E_GATEWAY_OPERATION_INVALID_PAYLOAD',
        })
      }

      const vpnProvider =
        this.dependencies.vpnProvider ?? (await resolveVpnProvider(gateway.vpnProvider))
      const routeId = gatewayVpnResources(gateway).routeId
      const sshService = this.dependencies.gatewaySshService ?? new GatewaySshService()
      if (operation.previousPayload === null) {
        const config = await sshService.getEthernetConfig(gateway)

        operation.previousPayload = {
          source: 'gateway_device',
          capturedAt: DateTime.now().toISO(),
          config,
        }

        await operation.save()
      }

      if (payload.mode === 'dhcp') {
        if (payload.dhcpFallbackEnabled) {
          if (
            !payload.staticIpAddress ||
            payload.staticPrefixLength === null ||
            !payload.staticGateway ||
            !payload.primaryDns
          ) {
            throw new Exception('DHCP fallback configuration is incomplete.', {
              status: 422,
              code: 'E_GATEWAY_DHCP_FALLBACK_CONFIG_INCOMPLETE',
            })
          }

          // Install the local recovery profile before DHCP restarts. If DHCP
          // never obtains a lease, only the gateway itself can still recover.
          //
          // The VPN provider must know the fallback address before the device needs
          // it. After DHCP is unavailable, the backend cannot add a route via
          // the gateway itself anymore.
          const currentAddress = sshService.ensureConnectionAddress(gateway)
          if (routeId && currentAddress !== payload.staticIpAddress) {
            await vpnProvider.updateRoutes(routeId, [currentAddress, payload.staticIpAddress])
          }

          await sshService.configureDhcpFallback(gateway, {
            ipAddress: payload.staticIpAddress,
            prefixLength: payload.staticPrefixLength,
            gateway: payload.staticGateway,
            primaryDns: payload.primaryDns,
            secondaryDns: payload.secondaryDns,
          })
        } else {
          await sshService.disableDhcpFallback(gateway)
        }

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

      if (currentAddress !== nextAddress) {
        if (!routeId) {
          throw new Exception('Gateway has no VPN route resource.', {
            status: 422,
            code: 'E_GATEWAY_NO_IP_SERVICE',
          })
        }

        await vpnProvider.updateRoutes(routeId, [currentAddress, nextAddress])
      }

      const rollbackToken = await sshService.armStaticRollback(gateway)
      staticRollbackArmed = true

      await sshService.setEthernetModeStatic(gateway, {
        ipAddress: nextAddress,
        prefixLength: payload.staticPrefixLength,
        gateway: payload.staticGateway,
        primaryDns: payload.primaryDns,
        secondaryDns: payload.secondaryDns,
      })

      await sshService.waitForConnection(gateway, nextAddress)

      await sshService.cancelStaticRollback(gateway, nextAddress, rollbackToken)

      // A static primary configuration must not retain a DHCP recovery policy.
      await sshService.disableDhcpFallbackAtAddress(gateway, nextAddress)

      gateway.managementIpAddress = nextAddress
      gateway.wanIpAddress = nextAddress
      gateway.wanIpObservedAt = DateTime.now()
      gateway.status = 'online'
      gateway.lastSeenAt = DateTime.now()
      await gateway.save()

      if (routeId && currentAddress !== nextAddress) {
        await vpnProvider.updateRoutes(routeId, [nextAddress])
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
      await this.markOperationAsFailed(operation, error, {
        minimumRetryDelaySeconds: staticRollbackArmed ? STATIC_ROLLBACK_RETRY_DELAY_SECONDS : 0,
      })

      throw error
    } finally {
      await gatewayLockService.release(gateway.id, lock.token)
      logger.debug(
        {
          event: 'gateway_network_lock_released',
          operationId: operation.id,
          gatewayId: gateway.id,
        },
        'Gateway network lock released'
      )
    }
  }
  private shouldRetry(error: unknown) {
    return (
      error instanceof Exception &&
      error.status >= 500 &&
      !NON_RETRYABLE_ERROR_CODES.has(String(error.code))
    )
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

    logger.info(
      {
        event: 'gateway_network_operation_applied',
        operationId: operation.id,
        gatewayId: operation.gatewayId,
        action: operation.action,
        attempts: operation.attempts,
      },
      'Gateway network operation applied'
    )
  }

  private async markOperationAsFailed(
    operation: GatewayNetworkOperation,
    error: unknown,
    options: { minimumRetryDelaySeconds: number } = { minimumRetryDelaySeconds: 0 }
  ) {
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
      const retryDelay = Math.max(
        BACKOFF_BASE_SECONDS * 2 ** (operation.attempts - 1),
        options.minimumRetryDelaySeconds
      )

      operation.status = 'pending'
      operation.availableAt = DateTime.now().plus({ seconds: retryDelay })
      operation.startedAt = null
      operation.finishedAt = null
      await operation.save()

      logger.warn(
        {
          event: 'gateway_network_operation_retry_scheduled',
          operationId: operation.id,
          gatewayId: operation.gatewayId,
          action: operation.action,
          attempts: operation.attempts,
          retryDelaySeconds: retryDelay,
          errorCode,
        },
        'Gateway network operation retry scheduled'
      )

      return
    }

    operation.status = 'failed'
    operation.availableAt = null
    operation.finishedAt = DateTime.now()
    await operation.save()

    if (errorCode === 'E_GATEWAY_SSH_HOST_KEY_MISMATCH') {
      try {
        await new GatewaySecurityAlertService().openSshHostKeyMismatch(operation)
      } catch (alertError) {
        logger.error(
          {
            event: 'gateway_security_alert_creation_failed',
            operationId: operation.id,
            gatewayId: operation.gatewayId,
            error: alertError,
          },
          'Could not persist gateway security alert'
        )
      }
    }

    logger.error(
      {
        event: 'gateway_network_operation_failed',
        operationId: operation.id,
        gatewayId: operation.gatewayId,
        action: operation.action,
        attempts: operation.attempts,
        errorCode,
      },
      'Gateway network operation failed'
    )
  }
}
