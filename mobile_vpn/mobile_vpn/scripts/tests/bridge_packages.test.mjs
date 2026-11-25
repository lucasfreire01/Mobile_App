import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, copyFile, writeFile, readFile, chmod, stat, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const archiveName = 'node-v24.22.2-linux-x64.tar.xz'
const grant = { apiUrl: 'https://backend.example', bridgeId: '12345678-1234-1234-1234-123456789abc', installationToken: 'G'.repeat(43) }

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'saganexus-package-test-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const scripts = join(root, 'repo/scripts')
  const commands = join(root, 'commands')
  const downloads = join(root, 'downloads')
  const binary = 'node-v24.22.2-linux-x64/bin/node'
  await mkdir(scripts, { recursive: true })
  await mkdir(commands)
  await mkdir(join(downloads, 'node-v24.22.2-linux-x64/bin'), { recursive: true })
  for (const file of ['package_gateway_bridge_linux.sh', 'gateway_lan_bridge.ts', 'bridge_pairing_relay.ts', 'validate_bridge_installation.ts', 'install_gateway_bridge_linux.sh']) {
    await copyFile(new URL(`../${file}`, import.meta.url), join(scripts, file))
  }
  await writeFile(join(downloads, binary), '#!/bin/sh\nexit 0\n')
  await chmod(join(downloads, binary), 0o755)
  const packed = spawnSync('tar', ['-cJf', join(downloads, archiveName), '-C', downloads, binary], { encoding: 'utf8' })
  assert.equal(packed.status, 0, packed.stderr)
  const archive = await readFile(join(downloads, archiveName))
  const digest = createHash('sha256').update(archive).digest('hex')
  await writeFile(join(downloads, 'SHASUMS256.txt'), `${digest}  ${archiveName}\n`)
  const curl = join(commands, 'curl')
  await writeFile(curl, '#!/bin/sh\nwhile [ "$#" -gt 0 ]; do case "$1" in -o) output="$2"; shift 2 ;; https:*) url="$1"; shift ;; *) shift ;; esac; done\nprintf "download\\n" >> "$TEST_DOWNLOAD_LOG"\ncp "$TEST_DOWNLOADS/${url##*/}" "$output"\n')
  await chmod(curl, 0o755)
  const config = join(root, 'bridge.json')
  await writeFile(config, JSON.stringify(grant))
  const output = join(root, 'bundle.tar.gz')
  const log = join(root, 'downloads.log')
  const env = { ...process.env, PATH: `${commands}:${process.env.PATH}`, TEST_DOWNLOADS: downloads, TEST_DOWNLOAD_LOG: log }
return { root, downloads, config, output, log, env, run: () => spawnSync('bash', [join(scripts, 'package_gateway_bridge_linux.sh'), output, config], { env, encoding: 'utf8' }) }
}

test('Linux package contains all modules, installer, bundled Node and private per-account config', async (t) => {
  const f = await fixture(t)
  const result = f.run()
  assert.equal(result.status, 0, result.stderr)
  const outputStat = await stat(f.output)
  assert.equal(outputStat.mode & 0o777, 0o600)
  const unpack = join(f.root, 'unpack')
  await mkdir(unpack)
  const extracted = spawnSync('tar', ['-xzf', f.output, '-C', unpack], { encoding: 'utf8' })
  assert.equal(extracted.status, 0, extracted.stderr)
  for (const file of ['bin/node', 'gateway_lan_bridge.ts', 'bridge_pairing_relay.ts', 'validate_bridge_installation.ts', 'bridge.json', 'install.sh']) {
    const fileStat = await stat(join(unpack, file))
    assert.equal(fileStat.isFile(), true)
  }
  assert.deepEqual(JSON.parse(await readFile(join(unpack, 'bridge.json'), 'utf8')), grant)
  const configStat = await stat(join(unpack, 'bridge.json'))
  assert.equal(configStat.mode & 0o777, 0o600)
  assert.equal(result.stdout.includes(grant.installationToken), false)
})

test('bad configuration fails before downloads and leaves the previous package intact', async (t) => {
  const f = await fixture(t)
  await writeFile(f.output, 'previous package')
  await writeFile(f.config, JSON.stringify({ ...grant, apiUrl: 'http://backend.example' }))
  const result = f.run()
  assert.notEqual(result.status, 0)
  assert.equal(await readFile(f.output, 'utf8'), 'previous package')
  await assert.rejects(() => stat(f.log))
})

test('checksum mismatch rejects downloads without replacing an existing package', async (t) => {
  const f = await fixture(t)
  await writeFile(f.output, 'previous package')
  await writeFile(join(f.downloads, 'SHASUMS256.txt'), `${'0'.repeat(64)}  ${archiveName}\n`)
  const result = f.run()
  assert.notEqual(result.status, 0)
  assert.equal(await readFile(f.output, 'utf8'), 'previous package')
  const remaining = await readdir(f.root)
  assert.equal(remaining.some((name) => name.startsWith('.saganexus-bridge.')), false)
})

test('expired temporary bootstrap configuration fails before downloads', async (t) => {
const f = await fixture(t)
await writeFile(f.config, JSON.stringify({ ...grant, expiresAt: Date.now() - 1 }))
const result = f.run()
assert.notEqual(result.status, 0)
await assert.rejects(() => stat(f.log))
})

test('Windows package script builds a universal installer without private configuration', async () => {
  const script = await readFile(new URL('../package_gateway_bridge_windows.ps1', import.meta.url), 'utf8')
  for (const file of ['gateway_lan_bridge.ts', 'bridge_pairing_relay.ts', 'install_gateway_bridge_windows.ps1']) {
    assert.match(script, new RegExp(`['\"]${file.replaceAll('.', '\\.') }['\"]`))
  }
  assert.doesNotMatch(script, /\$config|bridge\.json|installationToken/)
  assert.match(script, /\.exe/)
  assert.match(script, /IEXPRESS/)
  assert.match(script, /AppLaunched=install\.cmd/)
  assert.match(script, /powershell\.exe .*install\.ps1/)
  assert.match(script, /installCommand = .*powershell\.exe/)
  assert.match(script, /Move-Item \$pending \$output -Force/)
  assert.doesNotMatch(script, /Write-Output .*installationToken/)
})

test('Windows installer preflights OpenSSH before changing the installation', async () => {
  const installer = await readFile(new URL('../install_gateway_bridge_windows.ps1', import.meta.url), 'utf8')
  assert.match(installer, /requiredCommands\s*=\s*@\('ssh\.exe',\s*'ssh-keyscan\.exe'\)/)
  assert.match(installer, /Get-Command \$command -ErrorAction SilentlyContinue/)
  assert.match(installer, /OpenSSH obrigatório não encontrado/)
  const preflight = installer.indexOf('$requiredCommands')
  const firstMutation = Math.min(
    ...['New-Item', 'Set-Acl', 'Copy-Item', 'Move-Item', 'Register-ScheduledTask'].map((token) => installer.indexOf(token)),
  )
  assert.ok(preflight >= 0 && firstMutation > preflight, 'OpenSSH preflight must run before installation mutations')
  assert.doesNotMatch(installer, /\$validator|validate_bridge_installation\.ts/)
  assert.doesNotMatch(installer, /Copy-Item \$config/)
  assert.match(installer, /\$targets = \$files/)
})

test('Windows installer configures shared internet and private bridge firewall without fixed gateway IP', async () => {
const installer = await readFile(new URL('../install_gateway_bridge_windows.ps1', import.meta.url), 'utf8')
assert.match(installer, /Start-Process powershell\.exe -Verb RunAs/)
assert.match(installer, /HNetCfg\.HNetShare/)
assert.match(installer, /EnableSharing\(0\)/)
assert.match(installer, /EnableSharing\(1\)/)
assert.match(installer, /Trim\('\{\}'\)/)
assert.match(installer, /SagaNexus Gateway Bridge Discovery/)
assert.match(installer, /LocalPort \$rule\.Ports/)
assert.doesNotMatch(installer, /10\.42\.0\.126|10\.43\.0\.126|192\.168\.11\.20/)
})
