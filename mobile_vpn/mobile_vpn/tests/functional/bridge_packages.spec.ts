import { test } from '@japa/runner'
import { randomUUID } from 'node:crypto'
import { mkdtemp, readFile, writeFile, stat, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { setTimeout } from 'node:timers/promises'
import db from '@adonisjs/lucid/services/db'
import encryption from '@adonisjs/core/services/encryption'
import limiter from '@adonisjs/limiter/services/main'
import User from '#models/user'
import BridgePackageService from '#services/bridge_package_service'
import BridgePairingService from '#services/bridge_pairing_service'

test.group('Private per-account bridge package download', (group) => {
  const originalCreate = BridgePackageService.prototype.create
  const originalBuild = BridgePackageService.prototype.buildArchive
  const artifacts: { cleanup: (revoke?: boolean) => Promise<void> }[] = []
  const directories: string[] = []
  group.each.setup(async () => {
    await limiter.clear(['memory'])
    await db.from('saganexus_shared_cache').where('key', 'like', '%bridge%').delete()
    return async () => {
      BridgePackageService.prototype.create = originalCreate
      BridgePackageService.prototype.buildArchive = originalBuild
      for (const artifact of artifacts.splice(0)) await artifact.cleanup(true)
      for (const directory of directories.splice(0))
        await rm(directory, { recursive: true, force: true })
    }
  })

  test('unauthenticated and non-admin callers cannot trigger generation', async ({
    client,
    assert,
  }) => {
    let generated = false
    BridgePackageService.prototype.create = async function () {
      generated = true
      throw new Error('Generation forbidden')
    }
    const anonymous = await client
      .post('/api/v1/gateway-bridges/package')
      .json({ platform: 'linux-x64' })
    anonymous.assertStatus(401)
    const user = await User.create({
      email: `${randomUUID()}@example.test`,
      password: 'test-only-password',
      isAdmin: false,
    })
    const token = await User.accessTokens.create(user)
    const forbidden = await client
      .post('/api/v1/gateway-bridges/package')
      .header('authorization', `Bearer ${token.value!.release()}`)
      .json({ platform: 'linux-x64' })
    forbidden.assertStatus(403)
    assert.isFalse(generated)
  })

  test('HTTP download uses the authenticated owner, private headers and cleans temporary output', async ({
    client,
    assert,
  }) => {
    const user = await User.create({
      email: `${randomUUID()}@example.test`,
      password: 'test-only-password',
      isAdmin: true,
    })
    const token = await User.accessTokens.create(user)
    const directory = await mkdtemp(join(tmpdir(), 'saganexus-download-http-test-'))
    directories.push(directory)
    const path = join(directory, 'fixture.tar.gz')
    await writeFile(path, 'test-package')
    let cleaned = false
    BridgePackageService.prototype.create = async function (userId, platform) {
      assert.equal(userId, user.id)
      assert.equal(platform, 'linux-x64')
      return {
        path,
        bytes: 12,
        expiresAt: Date.now() + 60_000,
        cleanup: async () => {
          cleaned = true
          await rm(directory, { recursive: true, force: true })
        },
      }
    }
    const response = await client
      .post('/api/v1/gateway-bridges/package')
      .header('authorization', `Bearer ${token.value!.release()}`)
      .json({ platform: 'linux-x64' })
    response.assertStatus(200)
    response.assertHeader('cache-control', 'no-store')
    response.assertHeader('content-type', 'application/gzip')
    response.assertHeader(
      'content-disposition',
      'attachment; filename="saganexus-ponte-linux-x64.tar.gz"'
    )
    for (let attempt = 0; attempt < 20 && !cleaned; attempt++) await setTimeout(10)
    assert.isTrue(cleaned)
  })

  test('real service embeds only this account installation grant and removes files after transfer', async ({
    assert,
  }) => {
    let configPath = ''
    BridgePackageService.prototype.buildArchive = async function (config, output) {
      configPath = config
      await writeFile(output, 'test-package')
    }
    const service = new BridgePackageService()
    const artifact = await service.create(42, 'linux-x64', 'https://backend.example')
    artifacts.push(artifact)
    const config = JSON.parse(await readFile(configPath, 'utf8'))
    const file = await stat(configPath)
    assert.equal(file.mode & 0o777, 0o600)
    const row = await db
      .from('saganexus_shared_cache')
      .where('key', `registered-bridge:${config.bridgeId}`)
      .firstOrFail()
    const stored = encryption.decrypt<{ ownerUserId: number }>(row.payload)!
    assert.equal(stored.ownerUserId, 42)
    assert.notInclude(row.payload, config.installationToken)
    await artifact.cleanup()
    await assert.rejects(() => stat(dirname(configPath)))
    const active = await new BridgePairingService().activateBridge(
      config.bridgeId,
      config.installationToken,
      'P'.repeat(43)
    )
    assert.equal(active.bridgeId, config.bridgeId)
  })

  test('build failure revokes the unused grant and removes temporary files', async ({ assert }) => {
    let configPath = ''
    let bridgeId = ''
    BridgePackageService.prototype.buildArchive = async function (config) {
      configPath = config
      bridgeId = JSON.parse(await readFile(config, 'utf8')).bridgeId
      throw new Error('Simulated builder failure')
    }
    await assert.rejects(() =>
      new BridgePackageService().create(42, 'linux-x64', 'https://backend.example')
    )
    await assert.rejects(() => stat(dirname(configPath)))
    const row = await db
      .from('saganexus_shared_cache')
      .where('key', `registered-bridge:${bridgeId}`)
      .firstOrFail()
    const stored = encryption.decrypt<{ state: string }>(row.payload)!
    assert.equal(stored.state, 'revoked')
  })

  test('temporary installation credential authorizes one Linux package download', async ({ assert }) => {
    BridgePackageService.prototype.buildArchive = async function (_config, output) {
      await writeFile(output, 'test-package')
    }
    const grant = await new BridgePairingService().provisionBridge(42)
    const service = new BridgePackageService()
    const artifact = await service.createFromInstallationGrant(
      grant.bridgeId,
      grant.installationToken,
      'linux-x64',
      'https://backend.example'
    )
    artifacts.push(artifact)
    await assert.rejects(() =>
      service.createFromInstallationGrant(
        grant.bridgeId,
        grant.installationToken,
        'linux-x64',
        'https://backend.example'
      )
    )
    await artifact.cleanup()
  })

  test('limits concurrent packages and rejects insecure URL or unavailable platform before provisioning', async ({
    assert,
  }) => {
    const service = new BridgePackageService()
    await assert.rejects(() => service.create(42, 'linux-x64', 'http://backend.example'))
    await assert.rejects(() => service.create(42, 'windows-x64', 'https://backend.example'))
    BridgePackageService.prototype.buildArchive = async function (_config, output) {
      await writeFile(output, 'test-package')
    }
    const first = await service.create(42, 'linux-x64', 'https://backend.example')
    artifacts.push(first)
    await assert.rejects(() => service.create(42, 'linux-x64', 'https://backend.example'))
    await first.cleanup()
    const next = await service.create(42, 'linux-x64', 'https://backend.example')
    artifacts.push(next)
    await next.cleanup()
  })
})
