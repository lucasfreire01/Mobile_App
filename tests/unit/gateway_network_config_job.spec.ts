import { test } from '@japa/runner'
import { Exception } from '@adonisjs/core/exceptions'
import { DateTime } from 'luxon'
import GatewayNetworkConfigJob, {
  type GatewayNetworkConfigJobDependencies,
} from '#jobs/gateway_network_config'
import Gateway from '#models/gateway'
import GatewayNetworkOperation from '#models/gateway_network_operation'
import GatewaySecurityAlert from '#models/gateway_security_alert'

const PROCESSING_TOKEN = '5e9f4c53-22f4-4da9-988d-84df68caed58'

test.group('GatewayNetworkConfigJob', (group) => {
  group.each.setup(async () => {
    await GatewaySecurityAlert.query().delete()
    await GatewayNetworkOperation.query().delete()
    await Gateway.query().delete()
  })

  async function createGateway() {
    return Gateway.create({
      name: 'gateway-test',
      managementIpAddress: '10.42.0.126',
      status: 'offline',
    })
  }

  async function createOperation(gatewayId: number, payload: unknown) {
    return GatewayNetworkOperation.create({
      gatewayId,
      action: 'apply_dhcp',
      status: 'applying',
      attempts: 1,
      payload,
      processingToken: PROCESSING_TOKEN,
      processingExpiresAt: DateTime.now().plus({ minutes: 5 }),
      startedAt: DateTime.now(),
    })
  }

  function createDependencies(): GatewayNetworkConfigJobDependencies & {
    calls: string[]
    cloudRoutes: string[][]
  } {
    const calls: string[] = []
    const cloudRoutes: string[][] = []

    return {
      calls,
      cloudRoutes,
      gatewayLockService: {
        acquire: async () => {
          calls.push('lock.acquire')
          return {
            token: '8fc1ab0c-95bd-49b8-98f6-9afb5a593ce4',
            expiresAt: DateTime.now().plus({ minutes: 2 }),
          }
        },
        release: async () => {
          calls.push('lock.release')
        },
      },
      gatewaySshService: {
        ensureConnectionAddress: () => '10.42.0.126',
        getEthernetConfig: async () => {
          calls.push('ssh.getEthernetConfig')
          return "network.wan.proto='static'\nnetwork.wan.ipaddr='10.42.0.126'"
        },
        configureDhcpFallback: async () => {
          calls.push('ssh.configureDhcpFallback')
        },
        armStaticRollback: async () => {
          calls.push('ssh.armStaticRollback')
          return '5e9f4c53-22f4-4da9-988d-84df68caed58'
        },
        cancelStaticRollback: async () => {
          calls.push('ssh.cancelStaticRollback')
        },
        disableDhcpFallback: async () => {
          calls.push('ssh.disableDhcpFallback')
        },
        disableDhcpFallbackAtAddress: async () => {
          calls.push('ssh.disableDhcpFallbackAtAddress')
        },
        setEthernetModeDhcp: async () => {
          calls.push('ssh.setEthernetModeDhcp')
        },
        setEthernetModeStatic: async () => {
          calls.push('ssh.setEthernetModeStatic')
        },
        waitForConnection: async () => {
          calls.push('ssh.waitForConnection')
        },
      },
      cloudConnexaService: {
        updateIpServiceRoutes: async (_ipServiceId, routes) => {
          calls.push('cloud.updateIpServiceRoutes')
          cloudRoutes.push(routes)
        },
      },
    }
  }

  async function captureException(operation: () => Promise<unknown>) {
    try {
      await operation()
    } catch (error) {
      if (error instanceof Exception) {
        return error
      }

      throw error
    }

    throw new Error('Expected the job to throw an Exception')
  }

  test('applies DHCP and marks its operation as applied', async ({ assert }) => {
    const gateway = await createGateway()
    const operation = await createOperation(gateway.id, {
      mode: 'dhcp',
      dhcpFallbackEnabled: false,
      staticIpAddress: null,
      staticPrefixLength: null,
      staticGateway: null,
      primaryDns: null,
      secondaryDns: null,
    })
    const dependencies = createDependencies()

    const result = await new GatewayNetworkConfigJob(
      operation.id,
      PROCESSING_TOKEN,
      dependencies
    ).run()
    await operation.refresh()

    assert.equal(result.action, 'dhcp_applied')
    assert.deepEqual(dependencies.calls, [
      'lock.acquire',
      'ssh.getEthernetConfig',
      'ssh.disableDhcpFallback',
      'ssh.setEthernetModeDhcp',
      'lock.release',
    ])
    assert.equal(operation.status, 'applied')
    assert.equal(operation.errorCode, null)
    assert.isNull(operation.processingToken)
    assert.isNull(operation.processingExpiresAt)
    assert.isNotNull(operation.finishedAt)
    assert.equal(operation.previousPayload?.source, 'gateway_device')
    assert.equal(
      operation.previousPayload?.config,
      "network.wan.proto='static'\nnetwork.wan.ipaddr='10.42.0.126'"
    )
    assert.isString(operation.previousPayload?.capturedAt)
  })

  test('reschedules a transient SSH failure with exponential backoff', async ({ assert }) => {
    const gateway = await createGateway()
    const operation = await createOperation(gateway.id, {
      mode: 'dhcp',
      dhcpFallbackEnabled: false,
      staticIpAddress: null,
      staticPrefixLength: null,
      staticGateway: null,
      primaryDns: null,
      secondaryDns: null,
    })
    const dependencies = createDependencies()
    dependencies.gatewaySshService!.setEthernetModeDhcp = async () => {
      throw new Exception('SSH unavailable.', {
        status: 502,
        code: 'E_GATEWAY_SSH_CONNECTION_FAILED',
      })
    }

    const error = await captureException(() =>
      new GatewayNetworkConfigJob(operation.id, PROCESSING_TOKEN, dependencies).run()
    )
    await operation.refresh()

    assert.equal(error.code, 'E_GATEWAY_SSH_CONNECTION_FAILED')
    assert.equal(operation.status, 'pending')
    assert.equal(operation.errorCode, 'E_GATEWAY_SSH_CONNECTION_FAILED')
    assert.equal(operation.errorMessage, 'SSH unavailable.')
    assert.isNull(operation.startedAt)
    assert.isNull(operation.finishedAt)
    assert.isNull(operation.processingToken)
    assert.isNotNull(operation.availableAt)
    assert.isTrue(operation.availableAt! > DateTime.now().plus({ seconds: 25 }))
    assert.include(dependencies.calls, 'lock.release')
  })

  test('applies a static IP with temporary and final CloudConnexa routes', async ({ assert }) => {
    const gateway = await createGateway()
    gateway.ccIpServiceId = '1de8ef91-6976-4494-a055-7b8de5315830'
    await gateway.save()

    const operation = await createOperation(gateway.id, {
      mode: 'static',
      dhcpFallbackEnabled: false,
      staticIpAddress: '10.42.0.200',
      staticPrefixLength: 24,
      staticGateway: '10.42.0.1',
      primaryDns: '10.42.0.1',
      secondaryDns: null,
    })
    const dependencies = createDependencies()

    const result = await new GatewayNetworkConfigJob(
      operation.id,
      PROCESSING_TOKEN,
      dependencies
    ).run()
    await operation.refresh()
    await gateway.refresh()

    assert.equal(result.action, 'static_applied')
    assert.equal(result.managementIpAddress, '10.42.0.200')
    assert.deepEqual(dependencies.calls, [
      'lock.acquire',
      'ssh.getEthernetConfig',
      'cloud.updateIpServiceRoutes',
      'ssh.armStaticRollback',
      'ssh.setEthernetModeStatic',
      'ssh.waitForConnection',
      'ssh.cancelStaticRollback',
      'ssh.disableDhcpFallbackAtAddress',
      'cloud.updateIpServiceRoutes',
      'lock.release',
    ])
    assert.deepEqual(dependencies.cloudRoutes, [
      ['10.42.0.126', '10.42.0.200'],
      ['10.42.0.200'],
    ])
    assert.equal(gateway.managementIpAddress, '10.42.0.200')
    assert.equal(gateway.wanIpAddress, '10.42.0.200')
    assert.equal(gateway.status, 'online')
    assert.isNotNull(gateway.wanIpObservedAt)
    assert.isNotNull(gateway.lastSeenAt)
    assert.equal(operation.status, 'applied')
    assert.equal(operation.previousPayload?.source, 'gateway_device')
    assert.equal(
      operation.previousPayload?.config,
      "network.wan.proto='static'\nnetwork.wan.ipaddr='10.42.0.126'"
    )
  })

  test('retries a static IP change when the gateway does not reconnect', async ({ assert }) => {
    const gateway = await createGateway()
    gateway.ccIpServiceId = '1de8ef91-6976-4494-a055-7b8de5315830'
    await gateway.save()

    const operation = await createOperation(gateway.id, {
      mode: 'static',
      dhcpFallbackEnabled: false,
      staticIpAddress: '10.42.0.200',
      staticPrefixLength: 24,
      staticGateway: '10.42.0.1',
      primaryDns: '10.42.0.1',
      secondaryDns: null,
    })
    const dependencies = createDependencies()
    dependencies.gatewaySshService!.waitForConnection = async () => {
      dependencies.calls.push('ssh.waitForConnection')
      throw new Exception('Gateway did not reconnect on the new address.', {
        status: 504,
        code: 'E_GATEWAY_SSH_CONNECTION_TIMEOUT',
      })
    }

    const error = await captureException(() =>
      new GatewayNetworkConfigJob(operation.id, PROCESSING_TOKEN, dependencies).run()
    )
    await operation.refresh()
    await gateway.refresh()

    assert.equal(error.code, 'E_GATEWAY_SSH_CONNECTION_TIMEOUT')
    assert.deepEqual(dependencies.calls, [
      'lock.acquire',
      'ssh.getEthernetConfig',
      'cloud.updateIpServiceRoutes',
      'ssh.armStaticRollback',
      'ssh.setEthernetModeStatic',
      'ssh.waitForConnection',
      'lock.release',
    ])
    assert.deepEqual(dependencies.cloudRoutes, [['10.42.0.126', '10.42.0.200']])
    assert.equal(gateway.managementIpAddress, '10.42.0.126')
    assert.equal(gateway.wanIpAddress, null)
    assert.equal(operation.status, 'pending')
    assert.equal(operation.errorCode, 'E_GATEWAY_SSH_CONNECTION_TIMEOUT')
    assert.equal(operation.errorMessage, 'Gateway did not reconnect on the new address.')
    assert.isNull(operation.processingToken)
    assert.isNull(operation.processingExpiresAt)
    assert.isNull(operation.startedAt)
    assert.isNull(operation.finishedAt)
    assert.isNotNull(operation.availableAt)
    assert.isTrue(operation.availableAt! > DateTime.now().plus({ seconds: 145 }))
  })

  test('preserves the first device snapshot when retrying an operation', async ({ assert }) => {
    const gateway = await createGateway()
    const operation = await createOperation(gateway.id, {
      mode: 'dhcp',
      dhcpFallbackEnabled: false,
      staticIpAddress: null,
      staticPrefixLength: null,
      staticGateway: null,
      primaryDns: null,
      secondaryDns: null,
    })
    const firstSnapshot = {
      source: 'gateway_device',
      capturedAt: '2026-10-26T11:00:00.000-03:00',
      config: "network.wan.proto='static'\nnetwork.wan.ipaddr='10.42.0.126'",
    }

    operation.previousPayload = firstSnapshot
    await operation.save()

    const dependencies = createDependencies()
    dependencies.gatewaySshService!.getEthernetConfig = async () => {
      throw new Error('A retry must not capture a new previous state')
    }

    await new GatewayNetworkConfigJob(operation.id, PROCESSING_TOKEN, dependencies).run()
    await operation.refresh()

    assert.deepEqual(dependencies.calls, [
      'lock.acquire',
      'ssh.disableDhcpFallback',
      'ssh.setEthernetModeDhcp',
      'lock.release',
    ])
    assert.deepEqual(operation.previousPayload, firstSnapshot)
    assert.equal(operation.status, 'applied')
  })

  test('fails immediately when the gateway SSH host key does not match', async ({ assert }) => {
    const gateway = await createGateway()
    const operation = await createOperation(gateway.id, {
      mode: 'dhcp',
      dhcpFallbackEnabled: false,
      staticIpAddress: null,
      staticPrefixLength: null,
      staticGateway: null,
      primaryDns: null,
      secondaryDns: null,
    })
    const dependencies = createDependencies()
    dependencies.gatewaySshService!.disableDhcpFallback = async () => {
      throw new Exception('Gateway SSH host key fingerprint does not match.', {
        status: 502,
        code: 'E_GATEWAY_SSH_HOST_KEY_MISMATCH',
      })
    }

    const error = await captureException(() =>
      new GatewayNetworkConfigJob(operation.id, PROCESSING_TOKEN, dependencies).run()
    )
    await operation.refresh()

    assert.equal(error.code, 'E_GATEWAY_SSH_HOST_KEY_MISMATCH')
    assert.equal(operation.status, 'failed')
    assert.equal(operation.attempts, 1)
    assert.isNull(operation.availableAt)
    assert.isNotNull(operation.finishedAt)

    const alert = await GatewaySecurityAlert.query().where('operation_id', operation.id).firstOrFail()
    assert.equal(alert.gatewayId, gateway.id)
    assert.equal(alert.type, 'ssh_host_key_mismatch')
    assert.equal(alert.status, 'open')
  })

  test('fails permanently for an invalid payload without calling SSH', async ({ assert }) => {
    const gateway = await createGateway()
    const operation = await createOperation(gateway.id, { mode: 'unknown' })
    const dependencies = createDependencies()

    const error = await captureException(() =>
      new GatewayNetworkConfigJob(operation.id, PROCESSING_TOKEN, dependencies).run()
    )
    await operation.refresh()

    assert.equal(error.code, 'E_GATEWAY_OPERATION_INVALID_PAYLOAD')
    assert.equal(operation.status, 'failed')
    assert.equal(operation.errorCode, 'E_GATEWAY_OPERATION_INVALID_PAYLOAD')
    assert.isNotNull(operation.finishedAt)
    assert.deepEqual(dependencies.calls, ['lock.acquire', 'lock.release'])
  })

  test('rejects an operation that is not owned by this worker', async ({ assert }) => {
    const gateway = await createGateway()
    const operation = await createOperation(gateway.id, {
      mode: 'dhcp',
      dhcpFallbackEnabled: false,
      staticIpAddress: null,
      staticPrefixLength: null,
      staticGateway: null,
      primaryDns: null,
      secondaryDns: null,
    })

    const error = await captureException(() =>
      new GatewayNetworkConfigJob(operation.id, 'a2579119-32b0-41c0-a900-d6ff21829cac').run()
    )
    await operation.refresh()

    assert.equal(error.code, 'E_GATEWAY_OPERATION_NOT_CLAIMED')
    assert.equal(operation.status, 'applying')
    assert.equal(operation.processingToken, PROCESSING_TOKEN)
  })
})
