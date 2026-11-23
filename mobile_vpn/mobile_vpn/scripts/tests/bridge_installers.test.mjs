import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, mkdir, readFile, writeFile, copyFile, chmod, stat, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { validateBridgeInstallation } from '../validate_bridge_installation.ts'

const bridgeId = '12345678-1234-1234-1234-123456789abc'
const grant = { apiUrl: 'https://backend.example', bridgeId, installationToken: 'G'.repeat(43) }

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'saganexus-installer-test-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const source = join(root, 'package')
  const commands = join(root, 'commands')
  const data = join(root, 'data with spaces')
  const units = join(root, 'config/systemd/user')
  await mkdir(join(source, 'bin'), { recursive: true })
  await mkdir(commands)
  const node = join(source, 'bin/node')
  await writeFile(node, `#!/bin/sh\nexec '${process.execPath.replaceAll("'", "'\\''")}' "$@"\n`)
  await chmod(node, 0o755)
  for (const file of ['gateway_lan_bridge.ts', 'bridge_pairing_relay.ts', 'validate_bridge_installation.ts', 'install_gateway_bridge_linux.sh']) {
    await copyFile(new URL(`../${file}`, import.meta.url), join(source, file))
  }
  await writeFile(join(source, 'bridge.json'), JSON.stringify(grant))
  const log = join(root, 'systemctl.log')
  const systemctl = join(commands, 'systemctl')
  await writeFile(systemctl, '#!/bin/sh\nprintf "%s\\n" "$*" >> "$TEST_SYSTEMCTL_LOG"\ncase "$2" in is-active|is-enabled) test "${TEST_OLD_ACTIVE:-0}" = 1 ;; enable) test "${TEST_FAIL_ENABLE:-0}" != 1 ;; *) exit 0 ;; esac\n')
  await chmod(systemctl, 0o755)
  const env = { ...process.env, PATH: `${commands}:${process.env.PATH}`, XDG_DATA_HOME: data, XDG_CONFIG_HOME: join(root, 'config'), TEST_SYSTEMCTL_LOG: log, TEST_OLD_ACTIVE: '0', TEST_FAIL_ENABLE: '0' }
  const installed = join(data, 'saganexus/gateway-bridge')
  return { root, source, installed, units, log, env, run: () => spawnSync('bash', [join(source, 'install_gateway_bridge_linux.sh')], { env, encoding: 'utf8' }) }
}

test('validates automatic configuration and rejects insecure, missing, and expired grants', () => {
  validateBridgeInstallation(grant)
  for (const value of [null, {}, { ...grant, apiUrl: 'http://backend.example' }, { ...grant, installationToken: 'bad' }, { ...grant, expiresAt: Date.now() - 1 }]) {
    assert.throws(() => validateBridgeInstallation(value))
  }
  validateBridgeInstallation({ ...grant, bridgeToken: 'P'.repeat(43), expiresAt: 1 })
})

test('Linux installer carries modules and private config, supports spaces, and starts automatically', async (t) => {
  const f = await fixture(t)
  const result = f.run()
  assert.equal(result.status, 0, result.stderr)
  assert.deepEqual(JSON.parse(await readFile(join(f.installed, 'bridge.json'), 'utf8')), grant)
  const configStat = await stat(join(f.installed, 'bridge.json'))
  assert.equal(configStat.mode & 0o777, 0o600)
  const directoryStat = await stat(f.installed)
  assert.equal(directoryStat.mode & 0o777, 0o700)
  const moduleStat = await stat(join(f.installed, 'bridge_pairing_relay.ts'))
  assert.ok(moduleStat.isFile())
  assert.match(await readFile(join(f.units, 'saganexus-gateway-bridge.service'), 'utf8'), /ExecStart=".*data with spaces.*"/)
  assert.match(await readFile(f.log, 'utf8'), /enable --now saganexus-gateway-bridge.service/)
  assert.equal(result.stdout.includes(grant.installationToken), false)
})

test('Linux upgrade preserves the already activated identity', async (t) => {
  const f = await fixture(t)
  await mkdir(f.installed, { recursive: true })
  const active = { apiUrl: grant.apiUrl, bridgeId, bridgeToken: 'P'.repeat(43) }
  await writeFile(join(f.installed, 'bridge.json'), JSON.stringify(active))
  const result = f.run()
  assert.equal(result.status, 0, result.stderr)
  assert.deepEqual(JSON.parse(await readFile(join(f.installed, 'bridge.json'), 'utf8')), active)
})

test('Linux failed service activation restores earlier files, config, unit, and running state', async (t) => {
  const f = await fixture(t)
  await mkdir(f.installed, { recursive: true })
  await mkdir(f.units, { recursive: true })
  const active = { apiUrl: grant.apiUrl, bridgeId, bridgeToken: 'P'.repeat(43) }
  await writeFile(join(f.installed, 'bridge.json'), JSON.stringify(active))
  await writeFile(join(f.installed, 'gateway_lan_bridge.ts'), 'previous bridge')
  await writeFile(join(f.units, 'saganexus-gateway-bridge.service'), 'previous unit')
  f.env.TEST_OLD_ACTIVE = '1'
  f.env.TEST_FAIL_ENABLE = '1'
  const result = f.run()
  assert.notEqual(result.status, 0)
  assert.equal(await readFile(join(f.installed, 'gateway_lan_bridge.ts'), 'utf8'), 'previous bridge')
  assert.deepEqual(JSON.parse(await readFile(join(f.installed, 'bridge.json'), 'utf8')), active)
  assert.equal(await readFile(join(f.units, 'saganexus-gateway-bridge.service'), 'utf8'), 'previous unit')
  assert.match(await readFile(f.log, 'utf8'), /start saganexus-gateway-bridge.service/)
})

test('incomplete package fails before changing an existing installation', async (t) => {
  const f = await fixture(t)
  await mkdir(f.installed, { recursive: true })
  await writeFile(join(f.installed, 'gateway_lan_bridge.ts'), 'previous bridge')
  await rm(join(f.source, 'bridge_pairing_relay.ts'))
  const result = f.run()
  assert.notEqual(result.status, 0)
  assert.equal(await readFile(join(f.installed, 'gateway_lan_bridge.ts'), 'utf8'), 'previous bridge')
})

test('stdin bootstrap passes bash syntax validation', () => {
  const script = new URL('../install_gateway_bridge_from_stdin.sh', import.meta.url)
  const result = spawnSync('bash', ['-n', script.pathname], { encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
})
