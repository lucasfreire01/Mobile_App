import { execFile } from 'node:child_process'
import { mkdtemp, rm, stat, statfs, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import app from '@adonisjs/core/services/app'
import { Exception } from '@adonisjs/core/exceptions'
import BridgePairingService from './bridge_pairing_service.js'

// ponytail: one package per process; use a distributed job lease before scaling workers.
let preparingPackage = false

export default class BridgePackageService {
  async buildArchive(config: string, output: string) {
    await new Promise<void>((resolve, reject) => {
      execFile(
        'bash',
        [app.makePath('scripts/package_gateway_bridge_linux.sh'), output, config],
        {
          timeout: 120_000,
          maxBuffer: 65_536,
          // Do not pass database/provider credentials to packaging tools.
          env: { PATH: process.env.PATH ?? '/usr/bin:/bin', TMPDIR: join(config, '..') },
        },
        (error) => (error ? reject(new Error('Package generation failed')) : resolve())
      )
    })
  }

  async create(userId: number, platform: string, apiUrl: string) {
    if (platform !== 'linux-x64' || process.platform !== 'linux') {
      throw new Exception('O pacote desta plataforma ainda não está disponível.', {
        status: 501,
        code: 'E_BRIDGE_PACKAGE_PLATFORM',
      })
    }
    const url = new URL(apiUrl)
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !['/', '/api/v1', '/api/v1/'].includes(url.pathname)
    ) {
      throw new Exception('O servidor precisa de uma URL pública HTTPS para gerar a ponte.', {
        status: 503,
        code: 'E_BRIDGE_PACKAGE_CONFIG',
      })
    }
    if (preparingPackage) {
      throw new Exception('Um pacote já está sendo preparado. Tente novamente em instantes.', {
        status: 409,
        code: 'E_BRIDGE_PACKAGE_BUSY',
      })
    }
    preparingPackage = true
    let directory: string | undefined
    let bridgeId: string | undefined
    let cleaned = false
    const pairing = new BridgePairingService()
    const cleanup = async (revoke = false) => {
      if (cleaned) return
      cleaned = true
      try {
        if (revoke && bridgeId) await pairing.revokeBridge(bridgeId, userId).catch(() => {})
        if (directory) await rm(directory, { recursive: true, force: true })
      } finally {
        preparingPackage = false
      }
    }
    try {
      const space = await statfs(tmpdir())
      if (space.bavail * space.bsize < 256 * 1024 * 1024)
        throw new Error('Insufficient temporary space')
      directory = await mkdtemp(join(tmpdir(), 'saganexus-bridge-download-'))
      const grant = await pairing.provisionBridge(userId)
      bridgeId = grant.bridgeId
      const config = join(directory, 'bridge.json')
      const path = join(directory, 'bridge.tar.gz')
      await writeFile(config, JSON.stringify({ apiUrl: url.origin, ...grant }), {
        mode: 0o600,
        flag: 'wx',
      })
      await this.buildArchive(config, path)
      const archive = await stat(path)
      if (!archive.isFile() || archive.size < 1 || Date.now() >= grant.expiresAt)
        throw new Error('Invalid package output')
      return { path, bytes: archive.size, expiresAt: grant.expiresAt, cleanup }
    } catch {
      await cleanup(true)
      throw new Exception('Não foi possível preparar o pacote da ponte. Tente novamente.', {
        status: 503,
        code: 'E_BRIDGE_PACKAGE_BUILD',
      })
    }
  }

  async createFromInstallationGrant(bridgeId: string, installationToken: string, platform: string, apiUrl: string) {
    if (platform !== 'linux-x64' || process.platform !== 'linux') {
      throw new Exception('O pacote desta plataforma ainda não está disponível.', { status: 501, code: 'E_BRIDGE_PACKAGE_PLATFORM' })
    }
    const url = new URL(apiUrl)
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || !['/', '/api/v1', '/api/v1/'].includes(url.pathname))
      throw new Exception('O servidor precisa de uma URL pública HTTPS para gerar a ponte.', { status: 503, code: 'E_BRIDGE_PACKAGE_CONFIG' })
    if (preparingPackage) throw new Exception('Um pacote já está sendo preparado. Tente novamente em instantes.', { status: 409, code: 'E_BRIDGE_PACKAGE_BUSY' })
    preparingPackage = true
    let directory: string | undefined
    let cleaned = false
    const pairing = new BridgePairingService()
    const cleanup = async (revoke = false) => {
      if (cleaned) return
      cleaned = true
      try {
        if (revoke) await pairing.revokeInstallationGrant(bridgeId, installationToken).catch(() => {})
        if (directory) await rm(directory, { recursive: true, force: true })
      } finally { preparingPackage = false }
    }
    try {
      const space = await statfs(tmpdir())
      if (space.bavail * space.bsize < 256 * 1024 * 1024) throw new Error('Insufficient temporary space')
      directory = await mkdtemp(join(tmpdir(), 'saganexus-bridge-download-'))
      const grant = await pairing.authorizePackageDownload(bridgeId, installationToken)
      const config = join(directory, 'bridge.json')
      const path = join(directory, 'bridge.tar.gz')
      await writeFile(config, JSON.stringify({ apiUrl: url.origin, ...grant }), { mode: 0o600, flag: 'wx' })
      await this.buildArchive(config, path)
      const archive = await stat(path)
      if (!archive.isFile() || archive.size < 1 || Date.now() >= grant.expiresAt) throw new Error('Invalid package output')
      return { path, bytes: archive.size, expiresAt: grant.expiresAt, cleanup }
    } catch (error) {
      await cleanup(true)
      if (error instanceof Exception) throw error
      throw new Exception('Não foi possível preparar o pacote da ponte. Tente novamente.', { status: 503, code: 'E_BRIDGE_PACKAGE_BUILD' })
    }
  }
}
