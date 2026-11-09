import { spawn } from 'node:child_process'
import { appFile, readEnv, root, adminCredentials } from './database-roles.mjs'

const args = process.argv.slice(2)
if (!['migration:run', 'migration:status', 'db:seed', 'user:grant-admin'].includes(args[0])) {
  console.error(
    'Only migration:run, migration:status, db:seed and user:grant-admin may use this administrator wrapper.'
  )
  process.exit(1)
}
try {
  const app = readEnv(appFile)
  const admin = adminCredentials()
  const child = spawn(process.execPath, ['ace.js', ...args], {
    cwd: root,
    env: {
      // External production env files contain literal, fully resolved values.
      ...(process.env.DB_APP_ENV_FILE ? app : {}),
      ...process.env,
      DB_CONNECTION: app.DB_CONNECTION,
      DB_HOST: app.DB_HOST,
      DB_PORT: app.DB_PORT,
      DB_DATABASE: app.DB_DATABASE,
      ...admin,
    },
    stdio: 'inherit',
  })
  child.on('exit', (code) => {
    process.exitCode = code ?? 1
  })
  child.on('error', () => {
    console.error('Cannot start the database administration command.')
    process.exitCode = 1
  })
} catch {
  console.error('Cannot load the separate database administrator credentials.')
  process.exitCode = 1
}
