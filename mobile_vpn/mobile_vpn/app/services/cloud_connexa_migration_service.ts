import db from '@adonisjs/lucid/services/db'
import Gateway from '#models/gateway'
import CloudConnexaService, { type GatewayVpnResources } from '#services/cloud_connexa_service'
import { gatewayVpnAttributes, gatewayVpnResources } from '#services/vpn/registry'
import type { VpnResources } from '#services/vpn/types'

type MigrationStatus =
  'pending' | 'completed' | 'failed' | 'cleanup_pending' | 'reconciliation_required'
type Snapshot = { gatewayId: number; resources: Partial<VpnResources>; provider: string }
export type CloudConnexaMigrationResult = {
  status: 'skipped' | 'completed' | 'failed' | 'cleanup_pending' | 'reconciliation_required'
  migrationId?: number
  migrated: number
}

export default class CloudConnexaMigrationService {
  constructor(private readonly client: CloudConnexaService = new CloudConnexaService()) {}

  async migrateIfAccountChanged(): Promise<CloudConnexaMigrationResult> {
    const accountIdentity = this.client.accountIdentity()
    const latest = await db
      .from('vpn_account_migrations')
      .where('provider', 'cloudconnexa')
      .orderBy('id', 'desc')
      .first()
    if (latest?.account_identity === accountIdentity && latest.status === 'completed')
      return { status: 'skipped', migrationId: latest.id, migrated: 0 }
    if (latest && ['pending', 'failed'].includes(latest.status))
      return this.resume(latest.id, accountIdentity, latest)
    if (latest && ['cleanup_pending', 'reconciliation_required'].includes(latest.status))
      return { status: latest.status, migrationId: latest.id, migrated: 0 }
    const gateways = await Gateway.query().where('vpn_provider', 'cloudconnexa')
    const inserted = await db
      .table('vpn_account_migrations')
      .insert({
        provider: 'cloudconnexa',
        account_identity: accountIdentity,
        previous_account_identity: latest?.account_identity ?? null,
        status: 'pending',
        gateway_snapshots: JSON.stringify([]),
        started_at: new Date(),
        created_at: new Date(),
        updated_at: new Date(),
      })
      .returning('id')
    const migrationId = Number(Array.isArray(inserted) ? inserted[0].id : inserted)
    return this.execute(migrationId, gateways)
  }

  private async resume(
    migrationId: number,
    accountIdentity: string,
    state: any
  ): Promise<CloudConnexaMigrationResult> {
    if (state.account_identity !== accountIdentity)
      return { status: 'failed', migrationId, migrated: 0 }
    return this.execute(
      migrationId,
      await Gateway.query().where('vpn_provider', 'cloudconnexa'),
      this.readSnapshots(state.gateway_snapshots)
    )
  }

  private readSnapshots(
    value: unknown
  ): Array<{ gatewayId: number; old: Snapshot; next: GatewayVpnResources }> {
    try {
      return Array.isArray(value) ? value : JSON.parse(String(value || '[]'))
    } catch {
      return []
    }
  }

  private async execute(
    migrationId: number,
    gateways: Gateway[],
    previous: Array<{ gatewayId: number; old: Snapshot; next: GatewayVpnResources }> = []
  ): Promise<CloudConnexaMigrationResult> {
    const migrated = [...previous]
    try {
      for (const gateway of gateways) {
        const old: Snapshot = {
          gatewayId: gateway.id,
          resources: gatewayVpnResources(gateway),
          provider: gateway.vpnProvider,
        }
        if (migrated.some((entry) => entry.gatewayId === gateway.id)) continue
        const next = await this.client.createGatewayResources(
          String(gateway.name),
          String(gateway.managementIpAddress)
        )
        await db.transaction(async (trx) =>
          trx
            .from('gateways')
            .where('id', gateway.id)
            .update(
              this.gatewayColumns('cloudconnexa', {
                networkId: next.networkId,
                connectorId: next.connectorId,
                routeId: next.ipServiceId,
              })
            )
        )
        migrated.push({ gatewayId: gateway.id, old, next })
        await db
          .from('vpn_account_migrations')
          .where('id', migrationId)
          .update({ gateway_snapshots: JSON.stringify(migrated), updated_at: new Date() })
      }
      const cleanupFailures: string[] = []
      for (const entry of migrated) {
        const oldNetworkId = entry.old.resources.networkId
        if (!oldNetworkId || oldNetworkId === entry.next.networkId) continue
        try {
          await this.client.deleteNetwork(oldNetworkId)
        } catch {
          cleanupFailures.push(oldNetworkId)
        }
      }
      if (cleanupFailures.length) {
        await db
          .from('vpn_account_migrations')
          .where('id', migrationId)
          .update({
            status: 'reconciliation_required' satisfies MigrationStatus,
            gateway_snapshots: JSON.stringify({ migrated, cleanupFailures }),
            error_code: 'E_CLOUDCONNEXA_RECONCILIATION_REQUIRED',
            error_message: 'Old CloudConnexa networks require reconciliation.',
            updated_at: new Date(),
          })
        return { status: 'reconciliation_required', migrationId, migrated: migrated.length }
      }
      await db
        .from('vpn_account_migrations')
        .where('id', migrationId)
        .update({
          status: 'completed' satisfies MigrationStatus,
          gateway_snapshots: JSON.stringify(migrated),
          completed_at: new Date(),
          updated_at: new Date(),
        })
      return { status: 'completed', migrationId, migrated: migrated.length }
    } catch (error) {
      const cleanupFailures: string[] = []
      for (const entry of migrated.reverse()) {
        await db
          .from('gateways')
          .where('id', entry.gatewayId)
          .update(this.gatewayColumns(entry.old.provider, entry.old.resources as VpnResources))
        try {
          await this.client.deleteNetwork(entry.next.networkId)
        } catch {
          cleanupFailures.push(entry.next.networkId)
        }
      }
      const status: MigrationStatus = cleanupFailures.length ? 'reconciliation_required' : 'failed'
      const providerError = error as {
        code?: string
        upstreamStatus?: number
        upstreamBody?: unknown
      }
      const message = JSON.stringify({
        status: providerError.upstreamStatus ?? null,
        code: providerError.code ?? null,
        upstreamBody: providerError.upstreamBody ?? null,
      }).slice(0, 2000)
      await db
        .from('vpn_account_migrations')
        .where('id', migrationId)
        .update({
          status,
          gateway_snapshots: JSON.stringify({ migrated, cleanupFailures }),
          error_code: cleanupFailures.length
            ? 'E_CLOUDCONNEXA_RECONCILIATION_REQUIRED'
            : ((error as { code?: string })?.code ?? null),
          error_message: message.slice(0, 2000),
          updated_at: new Date(),
        })
      return { status, migrationId, migrated: 0 }
    }
  }

  private gatewayColumns(provider: string, resources: Partial<VpnResources>) {
    const attributes = gatewayVpnAttributes(provider, resources as VpnResources)
    return {
      vpn_provider: attributes.vpnProvider,
      vpn_resources: attributes.vpnResources,
      cc_network_id: attributes.ccNetworkId,
      cc_connector_id: attributes.ccConnectorId,
      cc_ip_service_id: attributes.ccIpServiceId,
      updated_at: new Date(),
    }
  }
}
