import test from 'node:test'
import assert from 'node:assert/strict'
import { randomInt, randomUUID } from 'node:crypto'
import {
  readEnv,
  appFile,
  runtimeFile,
  databaseClient,
  verifyRuntime,
} from '../scripts/database-roles.mjs'

// Standalone integration test: no Adonis bootstrap, migrations or gateway calls.
test('runtime permits application DML and rejects schema/account administration', async () => {
  const client = databaseClient(readEnv(appFile), readEnv(runtimeFile))
  await client.connect()
  try {
    assert.equal((await verifyRuntime(client)).elevatedPrivileges, false)
    await client.query('BEGIN')
    await client.query('SET LOCAL statement_timeout = 5000')
    await client.query('SAVEPOINT forbidden_ddl')
    await assert.rejects(
      client.query(`CREATE TABLE public.runtime_probe_${randomInt(1_000_000)} (id integer)`),
      { code: '42501' }
    )
    await client.query('ROLLBACK TO SAVEPOINT forbidden_ddl')
    await client.query('SAVEPOINT forbidden_user_write')
    await assert.rejects(client.query('UPDATE users SET is_admin = true WHERE false'), {
      code: '42501',
    })
    await client.query('ROLLBACK TO SAVEPOINT forbidden_user_write')
    await client.query('SAVEPOINT forbidden_migration_read')
    await assert.rejects(client.query('SELECT * FROM adonis_schema LIMIT 0'), { code: '42501' })
    await client.query('ROLLBACK TO SAVEPOINT forbidden_migration_read')

    // Explicit negative IDs avoid consuming production ID sequences. All rows roll back.
    const gatewayId = -randomInt(1_000_000, 1_000_000_000)
    const operationId = gatewayId - 1
    const tag = randomUUID()
    await client.query(
      "INSERT INTO gateways (id, name, management_ip_address, created_at, updated_at) VALUES ($1, $2, '192.0.2.254', now(), now())",
      [gatewayId, `runtime-probe-${tag}`]
    )
    await client.query("UPDATE gateways SET status = 'online' WHERE id = $1", [gatewayId])
    await client.query(
      "INSERT INTO gateway_ethernet_configs (id, gateway_id, mode, dhcp_fallback_enabled, created_at, updated_at) VALUES ($1, $2, 'dhcp', false, now(), now())",
      [gatewayId, gatewayId]
    )
    await client.query(
      'UPDATE gateway_ethernet_configs SET dhcp_fallback_enabled = false WHERE id = $1',
      [gatewayId]
    )
    await client.query(
      "INSERT INTO gateway_network_operations (id, gateway_id, action, status, attempts, created_at, updated_at, available_at) VALUES ($1, $2, 'apply_dhcp', 'pending', 0, now(), now(), now())",
      [operationId, gatewayId]
    )
    const claimed = await client.query(
      "SELECT id FROM gateway_network_operations WHERE id = $1 AND status = 'pending' FOR UPDATE SKIP LOCKED",
      [operationId]
    )
    assert.equal(claimed.rowCount, 1)
    await client.query("UPDATE gateway_network_operations SET status = 'applied' WHERE id = $1", [
      operationId,
    ])
    await client.query(
      "INSERT INTO gateway_security_alerts (id, gateway_id, operation_id, type, message, created_at, updated_at) VALUES ($1, $2, $3, 'probe', 'permission probe', now(), now())",
      [gatewayId, gatewayId, operationId]
    )
    await client.query("UPDATE gateway_security_alerts SET status = 'acknowledged' WHERE id = $1", [
      gatewayId,
    ])
    await client.query(
      'INSERT INTO worker_heartbeats (name, last_seen_at, created_at, updated_at) VALUES ($1, now(), now(), now()) ON CONFLICT (name) DO UPDATE SET last_seen_at = excluded.last_seen_at',
      [`probe-${tag}`]
    )
    await client.query(
      'INSERT INTO rate_limits (key, points, expire) VALUES ($1, 1, $2) ON CONFLICT (key) DO UPDATE SET points = rate_limits.points + 1',
      [tag, Date.now() + 60000]
    )
    await client.query('DELETE FROM rate_limits WHERE key = $1', [tag])
    await client.query('DELETE FROM gateways WHERE id = $1', [gatewayId])
    await client.query('ROLLBACK')
    assert.equal(
      (await client.query('SELECT id FROM gateways WHERE id = $1', [gatewayId])).rowCount,
      0
    )
  } finally {
    await client.query('ROLLBACK').catch(() => undefined)
    await client.end()
  }
})
