import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { performance } from 'node:perf_hooks'
import pg from 'pg'

// Does not boot Adonis, run migrations, issue tokens, or contact gateways.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
process.loadEnvFile(resolve(root, '.env'))
if (process.env.DB_CONNECTION !== 'pg') {
  throw new Error('This read-only diagnostic requires the configured PostgreSQL connection.')
}

const report = { collectedAt: new Date().toISOString(), scope: 'local read-only snapshot' }
const client = new pg.Client({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  application_name: 'saganexus-readonly-diagnostic',
  connectionTimeoutMillis: 5000,
  options: '-c default_transaction_read_only=on -c statement_timeout=3000 -c lock_timeout=1000',
})
const rows = async (sql, values = []) => (await client.query(sql, values)).rows

try {
  await client.connect()
  await client.query('BEGIN READ ONLY')
  report.database = (await rows(`SELECT current_setting('server_version') AS version,
    current_setting('transaction_read_only') AS read_only,
    current_setting('max_connections')::integer AS max_connections,
    current_setting('statement_timeout') AS diagnostic_statement_timeout`))[0]
  report.applicationRole = (await rows(`SELECT rolsuper, rolcreatedb, rolcreaterole, rolbypassrls
    FROM pg_roles WHERE rolname = current_user`))[0]
  report.connections = await rows(`SELECT state, count(*)::integer AS connections
    FROM pg_stat_activity WHERE datname = current_database() GROUP BY state`)
  report.tableStats = await rows(`SELECT relname, n_live_tup, n_dead_tup, seq_scan, idx_scan,
    pg_total_relation_size(relid)::bigint AS total_bytes, last_autoanalyze, last_analyze
    FROM pg_stat_user_tables WHERE schemaname = 'public' ORDER BY relname`)
  report.indexes = await rows(`SELECT tablename, indexname, indexdef FROM pg_indexes
    WHERE schemaname = 'public' ORDER BY tablename, indexname`)
  report.counts = (await rows(`SELECT
    (SELECT count(*)::integer FROM gateways) AS gateways,
    (SELECT count(*)::integer FROM gateway_network_operations) AS operations,
    (SELECT count(*)::integer FROM gateway_security_alerts) AS alerts`))[0]
  report.queue = await rows(`SELECT status, count(*)::integer AS total
    FROM gateway_network_operations GROUP BY status ORDER BY status`)
  report.extensions = await rows(`SELECT extname FROM pg_extension WHERE extname = 'pg_stat_statements'`)
  const gatewayId = (await rows('SELECT min(id) AS id FROM gateways'))[0].id ?? 0
  const queries = [
    ['gateway_list_current', 'SELECT * FROM gateways', []],
    ['operations_history', 'SELECT * FROM gateway_network_operations WHERE gateway_id = $1 ORDER BY created_at DESC LIMIT 20', [gatewayId]],
    ['alerts_history', 'SELECT * FROM gateway_security_alerts WHERE gateway_id = $1 ORDER BY created_at DESC LIMIT 20', [gatewayId]],
    ['queue_pending_select_only', "SELECT * FROM gateway_network_operations WHERE status = 'pending' AND available_at <= now() ORDER BY available_at ASC, id ASC LIMIT 1", []],
    ['lease_recovery_select_only', "SELECT id FROM gateway_network_operations WHERE status = 'applying' AND processing_expires_at <= now() AND attempts < 5", []],
    ['queue_health_pending_count', "SELECT count(*) FROM gateway_network_operations WHERE status = 'pending'", []],
  ]
  report.queryPlans = []
  for (const [name, sql, params] of queries) {
    const plan = (await rows(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${sql}`, params))[0]['QUERY PLAN'][0]
    report.queryPlans.push({ name, plan })
  }
  await client.query('ROLLBACK')
} catch (error) {
  // Error messages may contain connection settings. Persist only the error code.
  report.databaseError = { code: error.code ?? error.name }
  process.exitCode = 1
} finally {
  await client.end().catch(() => undefined)
}

const percentile = (values, p) => [...values].sort((a, b) => a - b)[Math.ceil(values.length * p) - 1]
const base = `http://127.0.0.1:${process.env.PORT || 3333}`
report.http = []
for (const [path, samples] of [['/health', 20], ['/api/v1/gateways', 1], ['/api/v1/health/queue', 1]]) {
  const durations = []
  const statuses = []
  try {
    for (let i = 0; i < samples; i++) {
      const started = performance.now()
      const response = await fetch(`${base}${path}`, { signal: AbortSignal.timeout(5000) })
      await response.arrayBuffer()
      durations.push(Number((performance.now() - started).toFixed(3)))
      statuses.push(response.status)
    }
    report.http.push({ path, samples, statuses: [...new Set(statuses)], p50Ms: percentile(durations, .5), p95Ms: percentile(durations, .95), maxMs: Math.max(...durations), durationsMs: durations })
  } catch (error) {
    report.http.push({ path, error: error.name })
    process.exitCode = 1
  }
}
const dependencies = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))
report.stack = Object.fromEntries(['@adonisjs/core', '@adonisjs/lucid', '@adonisjs/auth', '@adonisjs/limiter', 'pg'].map((name) => [name, dependencies.dependencies[name]]))
if (process.argv[2]) writeFileSync(resolve(process.argv[2]), JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify({ collectedAt: report.collectedAt, database: report.database, applicationRole: report.applicationRole, counts: report.counts, http: report.http.map(({ durationsMs, ...result }) => result), error: report.databaseError }, null, 2))
