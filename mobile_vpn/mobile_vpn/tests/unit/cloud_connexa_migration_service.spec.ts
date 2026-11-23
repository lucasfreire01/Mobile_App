import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import Gateway from '#models/gateway'
import CloudConnexaMigrationService from '#services/cloud_connexa_migration_service'
import CloudConnexaService, { type GatewayVpnResources } from '#services/cloud_connexa_service'

class FakeCloudConnexa extends CloudConnexaService {
  created: string[] = []
  createdResources: GatewayVpnResources[] = []
  deletedCascade: Array<GatewayVpnResources | undefined> = []
  deleted: string[] = []
  failDelete = false
  failDeleteFor = new Set<string>()
  failOn = 0
  failError: Error | null = null
  private sequence = 0

  override accountIdentity() {
    return 'new-account-identity'
  }

  override async createGatewayResources(_name: string, _ip: string): Promise<GatewayVpnResources> {
    this.sequence++
    if (this.failOn === this.sequence) throw this.failError ?? new Error('remote creation failed')
    const resources = {
      networkId: `new-network-${this.sequence}`,
      connectorId: `new-connector-${this.sequence}`,
      ipServiceId: `new-service-${this.sequence}`,
    }
    this.created.push(resources.networkId)
    this.createdResources.push(resources)
    return resources
  }

  override async deleteNetwork(networkId: string) {
    if (this.failDelete || this.failDeleteFor.has(networkId)) throw new Error('cleanup unavailable')
    this.deleted.push(networkId)
    const created = this.createdResources.find((resources) => resources.networkId === networkId)
    this.deletedCascade.push(created)
  }
}

test.group('CloudConnexa account migration', (group) => {
  group.each.setup(async () => {
    await db.from('vpn_account_migrations').delete()
    await Gateway.query().delete()
  })

  test('migrates existing gateways and is idempotent for the same account', async ({ assert }) => {
    const gateway = await Gateway.create({
      name: 'old-gateway',
      managementIpAddress: '10.42.0.126',
      vpnProvider: 'cloudconnexa',
      vpnResources: {
        networkId: 'old-network',
        connectorId: 'old-connector',
        routeId: 'old-service',
      },
      ccNetworkId: 'old-network',
      ccConnectorId: 'old-connector',
      ccIpServiceId: 'old-service',
    })
    const originalGatewayId = gateway.id
    const fake = new FakeCloudConnexa()
    const service = new CloudConnexaMigrationService(fake)
    const result = await service.migrateIfAccountChanged()
    await gateway.refresh()
    assert.equal(result.status, 'completed')
    assert.equal(result.migrated, 1)
    assert.equal(gateway.id, originalGatewayId)
    assert.equal(gateway.vpnResources?.networkId, 'new-network-1')
    assert.equal(gateway.vpnResources?.connectorId, 'new-connector-1')
    assert.equal(gateway.vpnResources?.routeId, 'new-service-1')
    assert.equal(gateway.ccNetworkId, 'new-network-1')
    assert.equal(gateway.ccConnectorId, 'new-connector-1')
    assert.equal(gateway.ccIpServiceId, 'new-service-1')
    assert.deepEqual(fake.deleted, ['old-network'])

    const second = await service.migrateIfAccountChanged()
    assert.equal(second.status, 'skipped')
    assert.deepEqual(fake.created, ['new-network-1'])
  })

  test('keeps new resources active when old network cleanup needs reconciliation', async ({
    assert,
  }) => {
    const gateway = await Gateway.create({
      name: 'cleanup-gateway',
      managementIpAddress: '10.42.0.7',
      vpnProvider: 'cloudconnexa',
      vpnResources: { networkId: 'old-cleanup', connectorId: 'old-c', routeId: 'old-r' },
    })
    const fake = new FakeCloudConnexa()
    fake.failDeleteFor.add('old-cleanup')

    const result = await new CloudConnexaMigrationService(fake).migrateIfAccountChanged()
    await gateway.refresh()
    const state = await db.from('vpn_account_migrations').first()

    assert.equal(result.status, 'reconciliation_required')
    assert.equal(gateway.vpnResources?.networkId, 'new-network-1')
    assert.deepEqual(fake.deleted, [])
    assert.equal(state.status, 'reconciliation_required')
    assert.include(JSON.stringify(state.gateway_snapshots), 'old-cleanup')
  })

  test('compensates migrated gateways and records failure when a later gateway fails', async ({
    assert,
  }) => {
    const first = await Gateway.create({
      name: 'one',
      managementIpAddress: '10.42.0.1',
      vpnProvider: 'cloudconnexa',
      vpnResources: { networkId: 'old-1', connectorId: 'old-c-1', routeId: 'old-r-1' },
    })
    await Gateway.create({
      name: 'two',
      managementIpAddress: '10.42.0.2',
      vpnProvider: 'cloudconnexa',
      vpnResources: { networkId: 'old-2', connectorId: 'old-c-2', routeId: 'old-r-2' },
    })
    const fake = new FakeCloudConnexa()
    fake.failOn = 2
    const result = await new CloudConnexaMigrationService(fake).migrateIfAccountChanged()
    await first.refresh()
    const state = await db.from('vpn_account_migrations').first()
    assert.equal(result.status, 'failed')
    assert.equal(first.vpnResources?.networkId, 'old-1')
    assert.deepEqual(fake.deleted, ['new-network-1'])
    assert.deepEqual(fake.deletedCascade, [
      {
        networkId: 'new-network-1',
        connectorId: 'new-connector-1',
        ipServiceId: 'new-service-1',
      },
    ])
    assert.equal(state.status, 'failed')
    assert.notProperty(state, 'client_secret')
  })

  test('records reconciliation when compensating cleanup fails', async ({ assert }) => {
    await Gateway.create({
      name: 'one',
      managementIpAddress: '10.42.0.3',
      vpnProvider: 'cloudconnexa',
      vpnResources: { networkId: 'old-3', connectorId: 'old-c-3', routeId: 'old-r-3' },
    })
    await Gateway.create({
      name: 'two',
      managementIpAddress: '10.42.0.4',
      vpnProvider: 'cloudconnexa',
      vpnResources: { networkId: 'old-4', connectorId: 'old-c-4', routeId: 'old-r-4' },
    })
    const fake = new FakeCloudConnexa()
    fake.failOn = 2
    fake.failDelete = true
    const result = await new CloudConnexaMigrationService(fake).migrateIfAccountChanged()
    const state = await db.from('vpn_account_migrations').first()
    assert.equal(result.status, 'reconciliation_required')
    assert.equal(state.status, 'reconciliation_required')
    assert.equal(state.error_code, 'E_CLOUDCONNEXA_RECONCILIATION_REQUIRED')
  })

  test('stores only sanitized upstream details on provider failure', async ({ assert }) => {
    await Gateway.create({
      name: 'upstream-error-gateway',
      managementIpAddress: '10.42.0.8',
      vpnProvider: 'cloudconnexa',
      vpnResources: { networkId: 'old-upstream', connectorId: 'old-c', routeId: 'old-r' },
    })
    const fake = new FakeCloudConnexa()
    fake.failOn = 1
    fake.failError = Object.assign(new Error('raw message must not persist'), {
      code: 'E_CLOUDCONNEXA_400',
      upstreamStatus: 400,
      upstreamBody: { detail: 'invalid route', Authorization: '[REDACTED]', token: '[REDACTED]' },
    })

    const result = await new CloudConnexaMigrationService(fake).migrateIfAccountChanged()
    const state = await db.from('vpn_account_migrations').first()

    assert.equal(result.status, 'failed')
    assert.equal(
      state.error_message,
      JSON.stringify({
        status: 400,
        code: 'E_CLOUDCONNEXA_400',
        upstreamBody: { detail: 'invalid route', Authorization: '[REDACTED]', token: '[REDACTED]' },
      }).slice(0, 2000)
    )
    assert.notInclude(state.error_message, 'raw message must not persist')
  })

  test('is a no-op when there are no CloudConnexa gateways', async ({ assert }) => {
    const result = await new CloudConnexaMigrationService(
      new FakeCloudConnexa()
    ).migrateIfAccountChanged()

    assert.equal(result.status, 'completed')
    assert.equal(result.migrated, 0)
  })

  test('resumes a pending migration from its persisted snapshot', async ({ assert }) => {
    const gateway = await Gateway.create({
      name: 'pending-gateway',
      managementIpAddress: '10.42.0.5',
      vpnProvider: 'cloudconnexa',
      vpnResources: { networkId: 'old-p', connectorId: 'old-pc', routeId: 'old-pr' },
    })
    await db.table('vpn_account_migrations').insert({
      provider: 'cloudconnexa',
      account_identity: 'new-account-identity',
      previous_account_identity: 'old-account-identity',
      status: 'pending',
      gateway_snapshots: JSON.stringify([]),
      started_at: new Date(),
      created_at: new Date(),
      updated_at: new Date(),
    })

    const result = await new CloudConnexaMigrationService(
      new FakeCloudConnexa()
    ).migrateIfAccountChanged()
    await gateway.refresh()

    assert.equal(result.status, 'completed')
    assert.equal(gateway.vpnResources?.networkId, 'new-network-1')
  })

  test('retries a failed migration without recreating its completed gateway', async ({
    assert,
  }) => {
    const gateway = await Gateway.create({
      name: 'failed-gateway',
      managementIpAddress: '10.42.0.6',
      vpnProvider: 'cloudconnexa',
      vpnResources: { networkId: 'old-f', connectorId: 'old-fc', routeId: 'old-fr' },
    })
    await db.table('vpn_account_migrations').insert({
      provider: 'cloudconnexa',
      account_identity: 'new-account-identity',
      previous_account_identity: 'old-account-identity',
      status: 'failed',
      gateway_snapshots: JSON.stringify([
        {
          gatewayId: gateway.id,
          old: {
            provider: 'cloudconnexa',
            resources: { networkId: 'old-f', connectorId: 'old-fc', routeId: 'old-fr' },
          },
          next: {
            networkId: 'new-network-existing',
            connectorId: 'new-connector-existing',
            ipServiceId: 'new-service-existing',
          },
        },
      ]),
      started_at: new Date(),
      created_at: new Date(),
      updated_at: new Date(),
    })

    const fake = new FakeCloudConnexa()
    const result = await new CloudConnexaMigrationService(fake).migrateIfAccountChanged()

    assert.equal(result.status, 'completed')
    assert.deepEqual(fake.created, [])
  })

  test('resumes reconciliation state and reports cleanup failure again', async ({ assert }) => {
    await db.table('vpn_account_migrations').insert({
      provider: 'cloudconnexa',
      account_identity: 'new-account-identity',
      previous_account_identity: 'old-account-identity',
      status: 'reconciliation_required',
      gateway_snapshots: JSON.stringify({ migrated: [], cleanupFailures: ['orphan-network'] }),
      started_at: new Date(),
      created_at: new Date(),
      updated_at: new Date(),
    })

    const result = await new CloudConnexaMigrationService(
      new FakeCloudConnexa()
    ).migrateIfAccountChanged()

    assert.equal(result.status, 'reconciliation_required')
  })
})
