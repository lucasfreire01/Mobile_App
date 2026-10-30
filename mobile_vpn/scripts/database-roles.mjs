import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { parseEnv } from 'node:util'
import pg from 'pg'

export const root = fileURLToPath(new URL('../', import.meta.url))
export const adminFile = resolve(root, process.env.DB_ADMIN_ENV_FILE || '.env.database-admin')
export const runtimeFile = resolve(root, process.env.DB_RUNTIME_ENV_FILE || '.env.database-runtime')
export const appFile = resolve(root, process.env.DB_APP_ENV_FILE || '.env')
export const readEnv = (file) => parseEnv(readFileSync(file, 'utf8'))
export const identifier = (value) => '"' + value.replaceAll('"', '""') + '"'
export const literal = (value) => "'" + value.replaceAll("'", "''") + "'"

// Explicit allowlist. New tables require review; migrations never grant runtime DDL.
export const tablePrivileges = {
  users: ['SELECT'],
  auth_access_tokens: ['SELECT', 'INSERT', 'UPDATE', 'DELETE'],
  gateways: ['SELECT', 'INSERT', 'UPDATE', 'DELETE'],
  gateway_ip_reservations: ['SELECT', 'INSERT', 'UPDATE', 'DELETE'],
  gateway_monitor_states: ['SELECT', 'INSERT', 'UPDATE'],
  gateway_ethernet_configs: ['SELECT', 'INSERT', 'UPDATE'],
  gateway_network_operations: ['SELECT', 'INSERT', 'UPDATE'],
  gateway_security_alerts: ['SELECT', 'INSERT', 'UPDATE'],
  gateway_ssh_host_key_rotations: ['SELECT', 'INSERT'],
  worker_heartbeats: ['SELECT', 'INSERT', 'UPDATE'],
  rate_limits: ['SELECT', 'INSERT', 'UPDATE', 'DELETE'],
}

export function databaseClient(app, credentials) {
  for (const value of [
    app.DB_HOST,
    app.DB_DATABASE,
    credentials.DB_USER,
    credentials.DB_PASSWORD,
  ]) {
    if (typeof value !== 'string' || !value)
      throw new Error('Explicit database connection values are required')
  }
  if (
    !Number.isInteger(Number(app.DB_PORT)) ||
    Number(app.DB_PORT) < 1 ||
    Number(app.DB_PORT) > 65535
  ) {
    throw new Error('Invalid database port')
  }
  return new pg.Client({
    host: app.DB_HOST,
    port: Number(app.DB_PORT),
    database: app.DB_DATABASE,
    user: credentials.DB_USER,
    password: credentials.DB_PASSWORD,
    connectionTimeoutMillis: 5000,
    application_name: 'saganexus-database-role-setup',
  })
}

export function adminCredentials() {
  const admin = readEnv(adminFile)
  return { DB_USER: admin.POSTGRES_USER, DB_PASSWORD: admin.POSTGRES_PASSWORD }
}

export async function verifyRuntime(client) {
  const {
    rows: [role],
  } = await client.query(`SELECT rolsuper, rolcreatedb, rolcreaterole,
    rolbypassrls, rolreplication FROM pg_roles WHERE rolname = current_user`)
  if (Object.values(role).some(Boolean)) throw new Error('Runtime role has elevated privileges')
  const {
    rows: [authority],
  } = await client.query(`SELECT
    has_database_privilege(current_user, current_database(), 'CREATE') AS database_create,
    EXISTS (SELECT 1 FROM pg_auth_members m JOIN pg_roles r ON r.oid = m.member WHERE r.rolname = current_user) AS memberships,
    EXISTS (SELECT 1 FROM pg_class c JOIN pg_roles r ON r.oid = c.relowner WHERE r.rolname = current_user) AS owns_relations`)
  if (Object.values(authority).some(Boolean))
    throw new Error('Runtime role has ownership or inherited authority')
  const {
    rows: [schema],
  } = await client.query(
    "SELECT has_schema_privilege(current_user, 'public', 'CREATE') AS can_create"
  )
  if (schema.can_create) throw new Error('Runtime role can create public schema objects')
  for (const [table, required] of Object.entries(tablePrivileges)) {
    for (const permission of [
      'SELECT',
      'INSERT',
      'UPDATE',
      'DELETE',
      'TRUNCATE',
      'REFERENCES',
      'TRIGGER',
    ]) {
      const {
        rows: [result],
      } = await client.query('SELECT has_table_privilege(current_user, $1, $2) AS allowed', [
        `public.${table}`,
        permission,
      ])
      if (result.allowed !== required.includes(permission))
        throw new Error(`Unexpected ${permission} privilege on ${table}`)
    }
    if (
      required.includes('INSERT') &&
      !['worker_heartbeats', 'rate_limits', 'gateway_monitor_states'].includes(table)
    ) {
      const {
        rows: [sequence],
      } = await client.query("SELECT pg_get_serial_sequence($1, 'id') AS name", [`public.${table}`])
      if (sequence.name) {
        const {
          rows: [permission],
        } = await client.query(
          "SELECT has_sequence_privilege(current_user, $1, 'USAGE') AS usage, has_sequence_privilege(current_user, $1, 'UPDATE') AS update",
          [sequence.name]
        )
        if (!permission.usage || permission.update)
          throw new Error(`Unexpected sequence privilege on ${table}`)
      }
    }
  }
  const {
    rows: [migration],
  } = await client.query(
    "SELECT has_table_privilege(current_user, 'public.adonis_schema', 'SELECT') AS allowed"
  )
  if (migration.allowed) throw new Error('Runtime role can access migration history')
  return {
    elevatedPrivileges: false,
    publicSchemaCreate: false,
    migrationHistoryAccess: false,
    tablePolicy: 'verified',
  }
}
