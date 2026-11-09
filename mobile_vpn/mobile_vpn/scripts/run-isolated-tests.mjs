import { randomBytes } from 'node:crypto'
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { stripVTControlCharacters } from 'node:util'
import {
  root,
  appFile,
  readEnv,
  databaseClient,
  adminCredentials,
  identifier,
  literal,
} from './database-roles.mjs'

const app = readEnv(appFile)
const runId = randomBytes(12).toString('hex')
const database = `saganexus_test_${runId}`
const username = `${database}_owner`
const password = randomBytes(32).toString('hex')
const appKey = randomBytes(32).toString('hex')
const admin = databaseClient(app, adminCredentials())
let roleCreated = false
let databaseCreated = false
let child
let output = ''
let interrupted = false
const result = {
  startedAt: new Date().toISOString(),
  database,
  testRoleSuperuser: false,
  credentialsPersisted: false,
  operationalDatabaseUsedForTests: false,
}
const secrets = [password, appKey]
const redact = (text) =>
  secrets
    .reduce((value, secret) => value.split(secret).join('[redacted]'), text)
    .replace(/oat_[A-Za-z0-9_=-]+/g, '[redacted token]')
const onSignal = () => {
  interrupted = true
  child?.kill('SIGTERM')
}
process.on('SIGINT', onSignal)
process.on('SIGTERM', onSignal)

async function availablePort() {
  const socket = createServer()
  await new Promise((accept, reject) => {
    socket.once('error', reject)
    socket.listen(0, '127.0.0.1', accept)
  })
  const { port } = socket.address()
  await new Promise((accept) => socket.close(accept))
  return port
}

try {
  await admin.connect()
  await admin.query(
    `CREATE ROLE ${identifier(username)} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT PASSWORD ${literal(password)}`
  )
  roleCreated = true
  await admin.query(
    `CREATE DATABASE ${identifier(database)} OWNER ${identifier(username)} TEMPLATE template0`
  )
  databaseCreated = true
  await admin.query(`REVOKE CONNECT ON DATABASE ${identifier(database)} FROM PUBLIC`)
  const restricted = databaseClient(app, { DB_USER: username, DB_PASSWORD: password })
  try {
    await restricted.connect()
    try {
      await restricted.query('SELECT id FROM public.gateways LIMIT 0')
      throw new Error('Test role unexpectedly has access to operational gateways')
    } catch (error) {
      if (error.code !== '42501') throw error
      result.operationalTableAccessDenied = true
    }
  } finally {
    await restricted.end()
  }
  const port = await availablePort()
  console.log(
    `Isolated PostgreSQL regression: ${database}; operational tables inaccessible to test role.`
  )
  const testEnv = {
    ...process.env,
    NODE_ENV: 'test',
    HOST: '127.0.0.1',
    PORT: String(port),
    APP_URL: `http://127.0.0.1:${port}`,
    APP_KEY: appKey,
    LOG_LEVEL: 'silent',
    TZ: 'UTC',
    DB_CONNECTION: 'pg',
    DB_HOST: app.DB_HOST,
    DB_PORT: app.DB_PORT,
    DB_DATABASE: database,
    DB_USER: username,
    DB_PASSWORD: password,
    SAGANEXUS_TEST_RUN_ID: runId,
    SESSION_DRIVER: 'memory',
    LIMITER_STORE: 'memory',
    VPN_PROVIDER: 'cloudconnexa',
    BROWAN_SSH_KEY_PATH: resolve(root, 'tmp', `nonexistent-test-key-${runId}`),
    BROWAN_SSH_USERNAME: 'test',
    BROWAN_SSH_PORT: '9',
    CLOUDCONNEXA_BASE_URL: 'http://127.0.0.1:9',
    CLOUDCONNEXA_CLIENT_ID: 'isolated-test',
    CLOUDCONNEXA_CLIENT_SECRET: 'isolated-test',
    CLOUDCONNEXA_REGION: 'test',
    CLOUDCONNEXA_ACCESS_GROUP_ID: '',
    GATEWAY_MGMT_IP_PREFIX: '10.42.0',
    GATEWAY_SSH_ALLOWED_CIDRS: '10.42.0.0/24,192.168.11.0/24',
    SEED_ADMIN_EMAIL: 'isolated@example.test',
    SEED_ADMIN_PASSWORD: 'isolated-test-only',
  }
  // No administrator credentials are included in the child's environment.
  for (const key of [
    'PGPASSWORD',
    'PGUSER',
    'PGDATABASE',
    'PGHOST',
    'PGPORT',
    'DATABASE_URL',
    'POSTGRES_PASSWORD',
    'POSTGRES_USER',
    'DB_ADMIN_ENV_FILE',
    'DB_RUNTIME_ENV_FILE',
    'DB_APP_ENV_FILE',
  ])
    delete testEnv[key]
  if (interrupted) throw new Error('Test run interrupted before startup')
  child = spawn(process.execPath, ['ace.js', 'test', ...process.argv.slice(2)], {
    cwd: root,
    env: testEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const collect = (chunk) => {
    output += chunk.toString()
    if (output.length > 5_000_000) child.kill('SIGTERM')
  }
  child.stdout.on('data', collect)
  child.stderr.on('data', collect)
  const timeout = setTimeout(() => {
    result.timedOut = true
    child.kill('SIGKILL')
  }, 180_000)
  timeout.unref()
  try {
    result.exitCode = await new Promise((accept, reject) => {
      child.once('error', reject)
      child.once('exit', (code) => accept(code ?? 1))
    })
  } finally {
    clearTimeout(timeout)
  }
  process.stdout.write(redact(output))
  const passed = stripVTControlCharacters(output).match(/Tests\s+(\d+)\s+passed/)
  if (passed) result.testsPassed = Number(passed[1])
  // Ace can return zero for startup failures. Require the Japa success summary too.
  if (
    result.exitCode === 0 &&
    (!result.testsPassed || !/\bPASSED\b/.test(stripVTControlCharacters(output)))
  ) {
    result.exitCode = 1
    result.errorCode = 'TEST_SUCCESS_NOT_CONFIRMED'
  }
  process.exitCode = result.exitCode
} catch (error) {
  result.errorCode = error.code ?? 'ISOLATED_TEST_SETUP_FAILED'
  console.error(`Isolated regression failed: ${result.errorCode}`)
  process.exitCode = 1
} finally {
  // Only names generated by this invocation, and only objects it created.
  try {
    if (databaseCreated) {
      await admin.query(`DROP DATABASE ${identifier(database)} WITH (FORCE)`)
      result.databaseRemoved = true
    }
    if (roleCreated) {
      await admin.query(`DROP ROLE ${identifier(username)}`)
      result.roleRemoved = true
    }
  } catch (error) {
    result.cleanupErrorCode = error.code ?? 'CLEANUP_FAILED'
    process.exitCode = 1
  }
  await admin.end().catch(() => undefined)
  process.off('SIGINT', onSignal)
  process.off('SIGTERM', onSignal)
  result.finishedAt = new Date().toISOString()
  mkdirSync(resolve(root, 'tmp'), { recursive: true })
  writeFileSync(resolve(root, 'tmp', `isolated-tests-${runId}.log`), redact(output), {
    mode: 0o600,
  })
  writeFileSync(
    resolve(root, 'docs', 'backend-regression-result.json'),
    JSON.stringify(result, null, 2) + '\n'
  )
  console.log(JSON.stringify(result))
}
