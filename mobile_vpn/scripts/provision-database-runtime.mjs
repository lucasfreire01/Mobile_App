import { chmodSync, existsSync, renameSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import {
  adminFile,
  runtimeFile,
  appFile,
  readEnv,
  identifier,
  literal,
  databaseClient,
  adminCredentials,
  tablePrivileges,
  verifyRuntime,
} from './database-roles.mjs'

const action = process.argv[2]
if (!['prepare', 'activate', 'verify'].includes(action)) {
  console.error('Usage: node scripts/provision-database-runtime.mjs prepare|verify|activate')
  process.exit(1)
}
const envLine = (key, value) => {
  if (typeof value !== 'string' || /['\r\n]/.test(value))
    throw new Error('Unsupported credential format')
  return `${key}='${value}'\n`
}
const app = readEnv(appFile)
if (app.DB_CONNECTION !== 'pg') throw new Error('PostgreSQL connection required')
let admin
let candidate
try {
  if (action === 'prepare') {
    // Preserve the existing administrator outside the application's environment.
    if (!existsSync(adminFile)) {
      writeFileSync(
        adminFile,
        envLine('POSTGRES_USER', app.DB_USER) +
          envLine('POSTGRES_PASSWORD', app.DB_PASSWORD) +
          envLine('POSTGRES_DB', app.DB_DATABASE),
        { mode: 0o600, flag: 'wx' }
      )
    }
    admin = databaseClient(app, adminCredentials())
    await admin.connect()
    candidate = existsSync(runtimeFile)
      ? readEnv(runtimeFile)
      : {
          DB_USER: 'saganexus_runtime',
          DB_PASSWORD: randomBytes(32).toString('hex'),
        }
    if (candidate.DB_USER === adminCredentials().DB_USER)
      throw new Error('Administrator and runtime must be different roles')
    await admin.query('BEGIN')
    const { rows: existing } = await admin.query('SELECT oid FROM pg_roles WHERE rolname = $1', [
      candidate.DB_USER,
    ])
    if (existing.length && !existsSync(runtimeFile))
      throw new Error('Refusing to reuse an unrelated existing role')
    if (existing.length) {
      const {
        rows: [memberships],
      } = await admin.query(
        'SELECT count(*)::int AS total FROM pg_auth_members WHERE member = $1',
        [existing[0].oid]
      )
      if (memberships.total) throw new Error('Runtime role must not have role memberships')
    }
    const name = identifier(candidate.DB_USER)
    if (!existing.length) {
      await admin.query(
        `CREATE ROLE ${name} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT PASSWORD ${literal(candidate.DB_PASSWORD)}`
      )
    }
    await admin.query(`GRANT CONNECT ON DATABASE ${identifier(app.DB_DATABASE)} TO ${name}`)
    await admin.query(`GRANT USAGE ON SCHEMA public TO ${name}`)
    for (const [table, privileges] of Object.entries(tablePrivileges)) {
      await admin.query(`REVOKE ALL ON TABLE public.${identifier(table)} FROM ${name}`)
      await admin.query(
        `GRANT ${privileges.join(', ')} ON TABLE public.${identifier(table)} TO ${name}`
      )
      if (privileges.includes('INSERT') && !['worker_heartbeats', 'rate_limits'].includes(table)) {
        const {
          rows: [sequence],
        } = await admin.query("SELECT pg_get_serial_sequence($1, 'id') AS name", [
          `public.${table}`,
        ])
        if (sequence.name)
          await admin.query(
            `GRANT USAGE ON SEQUENCE ${sequence.name.split('.').map(identifier).join('.')} TO ${name}`
          )
      }
    }
    if (!existsSync(runtimeFile))
      writeFileSync(
        runtimeFile,
        envLine('DB_USER', candidate.DB_USER) + envLine('DB_PASSWORD', candidate.DB_PASSWORD),
        { mode: 0o600, flag: 'wx' }
      )
    // Persist the candidate before commit so an interrupted write cannot orphan
    // a newly committed login whose generated password has been lost.
    await admin.query('COMMIT')
    chmodSync(adminFile, 0o600)
    chmodSync(runtimeFile, 0o600)
  }
  candidate ??= readEnv(runtimeFile)
  const runtime = databaseClient(app, candidate)
  try {
    await runtime.connect()
    const verification = await verifyRuntime(runtime)
    if (action === 'activate') {
      // Modify only these two existing keys; never print credentials or the env file.
      const { readFileSync } = await import('node:fs')
      let content = readFileSync(appFile, 'utf8')
      for (const key of ['DB_USER', 'DB_PASSWORD']) {
        const pattern = new RegExp(`^${key}=.*$`, 'm')
        if (!pattern.test(content)) throw new Error(`Missing ${key} in application environment`)
        content = content.replace(pattern, () => envLine(key, candidate[key]).trimEnd())
      }
      writeFileSync(appFile + '.runtime-switch', content, { mode: 0o600, flag: 'wx' })
      renameSync(appFile + '.runtime-switch', appFile)
    }
    console.log(JSON.stringify({ action, runtimeRole: candidate.DB_USER, ...verification }))
  } finally {
    await runtime.end().catch(() => undefined)
  }
} catch (error) {
  await admin?.query('ROLLBACK').catch(() => undefined)
  console.error(JSON.stringify({ status: 'failed', code: error.code ?? 'ROLE_SETUP_FAILED' }))
  process.exitCode = 1
} finally {
  await admin?.end().catch(() => undefined)
}
