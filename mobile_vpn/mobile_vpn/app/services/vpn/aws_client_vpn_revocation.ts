import { Exception } from '@adonisjs/core/exceptions'
import { execFile } from 'node:child_process'
import { chmod, mkdtemp, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { setTimeout as delay } from 'node:timers/promises'

const run = promisify(execFile)
type ExecuteAws = (args: string[]) => Promise<unknown>
type ReadRevokedSerials = (crl: string, authorityPem: string) => Promise<string[]>

const executeAws: ExecuteAws = async (args) => {
  const { stdout } = await run('aws', [...args, '--output', 'json', '--no-cli-pager', '--no-cli-auto-prompt'], {
    timeout: 10_000,
    maxBuffer: 4 * 1024 * 1024,
  })
  return JSON.parse(stdout)
}

const readRevokedSerials: ReadRevokedSerials = async (crl, authorityPem) => {
  const folder = await mkdtemp(join(tmpdir(), 'saganexus-aws-pca-crl-'))
  let text: string
  try {
    const authorityPath = join(folder, 'authority.pem')
    const crlPath = join(folder, 'revocation.pem')
    await writeFile(authorityPath, authorityPem, { flag: 'wx', mode: 0o600 })
    await writeFile(crlPath, crl, { flag: 'wx', mode: 0o600 })
    const result = await run('openssl', [
      'crl', '-in', crlPath, '-CAfile', authorityPath, '-verify',
      '-noout', '-text', '-lastupdate', '-nextupdate', '-dateopt', 'iso_8601',
    ], { timeout: 10_000, maxBuffer: 4 * 1024 * 1024 })
    if (result.stderr.trim() !== 'verify OK') throw new Error('CRL signature is invalid')
    text = result.stdout
  } finally {
    await rm(folder, { recursive: true, force: true })
  }
  const firstValid = Date.parse(text.match(/^lastUpdate=(.+)$/m)?.[1] ?? '')
  const endValid = Date.parse(text.match(/^nextUpdate=(.+)$/m)?.[1] ?? '')
  const now = Date.now()
  if (!(firstValid <= now && endValid > now)) throw new Error('CRL validity dates are invalid')
  return Array.from(text.matchAll(/^[ \t]+Serial Number:[ \t]*([0-9A-Fa-f]+)[ \t]*$/gm), (match) => match[1])
}

export default class AwsClientVpnRevocation {
  constructor(
    private readonly endpointId: string,
    private readonly region: string,
    private readonly execute: ExecuteAws = executeAws,
    private readonly readSerials: ReadRevokedSerials = readRevokedSerials
  ) {
    if (!/^cvpn-endpoint-[0-9a-f]+$/.test(endpointId) || !/^[a-z]{2}(?:-[a-z0-9]+)+-[0-9]+$/.test(region)) {
      throw new Exception('AWS Client VPN endpoint configuration is invalid.', {
        status: 503,
        code: 'E_VPN_PROVIDER_NOT_CONFIGURED',
      })
    }
  }

  /** This only confirms the AWS endpoint has imported the revocation. It never replaces the CRL. */
  async endpointHasRevocation(serial: string, authorityPem: string) {
    if (!/^[0-9a-fA-F]{1,40}$/.test(serial)) throw this.failure()
    try {
      const result = await this.call('export-client-vpn-client-certificate-revocation-list')
      const { Status, CertificateRevocationList } = result as {
        Status?: { Code?: unknown }
        CertificateRevocationList?: unknown
      }
      if (Status?.Code !== 'active' || typeof CertificateRevocationList !== 'string') return false
      const existing = await this.readSerials(CertificateRevocationList, authorityPem)
      return existing.some((value) => BigInt(`0x${value}`) === BigInt(`0x${serial}`))
    } catch {
      throw this.failure()
    }
  }

  async importCurrentCrl(crlPath: string, serial: string, authorityPem: string) {
    if (!crlPath.startsWith('/') || !/^[0-9a-fA-F]{1,40}$/.test(serial)) throw this.failure()
    try {
      const path = await realpath(crlPath)
      const file = await stat(path)
      if (!file.isFile() || (file.mode & 0o077) !== 0) throw this.failure()
      const crl = await readFile(path, 'utf8')
      const revoked = await this.readSerials(crl, authorityPem)
      if (!revoked.some((value) => BigInt(`0x${value}`) === BigInt(`0x${serial}`))) {
        throw this.failure()
      }
      await this.call('import-client-vpn-client-certificate-revocation-list', [
        '--certificate-revocation-list', `fileb://${path}`,
      ])
      return await this.endpointHasRevocation(serial, authorityPem)
    } catch {
      throw this.failure()
    }
  }

  async importLatestCrl(crlUri: string, serial: string, authorityPem: string) {
    if (!/^s3:\/\/[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]\/[^\s]+$/.test(crlUri)) {
      throw this.failure()
    }
    const folder = await mkdtemp(join(tmpdir(), 'saganexus-aws-client-crl-'))
    const path = join(folder, 'client.crl')
    try {
      for (let attempt = 0; attempt < 12; attempt += 1) {
        const { stdout } = await run('aws', ['s3', 'cp', crlUri, path, '--no-cli-pager', '--no-cli-auto-prompt'], {
          timeout: 15_000,
          maxBuffer: 64 * 1024,
        })
        void stdout
        await chmod(path, 0o600)
        const crl = await readFile(path, 'utf8')
        const serials = await this.readSerials(crl, authorityPem)
        if (serials.some((value) => BigInt(`0x${value}`) === BigInt(`0x${serial}`))) {
          const imported = await this.importCurrentCrl(path, serial, authorityPem)
          if (imported) return true
        }
        await delay(5_000)
      }
    } catch {
      throw this.failure()
    } finally {
      await rm(folder, { recursive: true, force: true })
    }
    return false
  }

  async terminateRevokedClientSessions(identity: string) {
    if (!/^saganexus-[0-9a-f]{32}$/.test(identity)) throw this.failure()
    try {
      const result = await this.call('describe-client-vpn-connections', [
        '--query',
        '{Connections:Connections[].{ClientVpnEndpointId:ClientVpnEndpointId,ConnectionId:ConnectionId,CommonName:CommonName,Status:Status.Code},NextToken:NextToken}',
      ]) as { Connections?: unknown; NextToken?: unknown }
      if (!Array.isArray(result.Connections) || result.NextToken != null) throw this.failure()
      const matches: string[] = []
      let disconnecting = false
      for (const value of result.Connections as unknown[]) {
        if (!value || typeof value !== 'object') throw this.failure()
        const connection = value as Record<string, unknown>
        if (connection.ClientVpnEndpointId !== this.endpointId || typeof connection.Status !== 'string') {
          throw this.failure()
        }
        if (connection.CommonName !== identity || connection.Status === 'terminated') continue
        if (connection.Status === 'terminating') {
          disconnecting = true
          continue
        }
        if (typeof connection.ConnectionId !== 'string' ||
            !/^cvpn-connection-[0-9a-f]+$/.test(connection.ConnectionId)) throw this.failure()
        matches.push(connection.ConnectionId)
      }
      for (const id of new Set(matches)) {
        await this.call('terminate-client-vpn-connections', ['--connection-id', id])
      }
      return matches.length === 0 && !disconnecting
    } catch {
      throw this.failure()
    }
  }

  private call(action: string, args: string[] = []) {
    return this.execute([
      'ec2', action, '--client-vpn-endpoint-id', this.endpointId, '--region', this.region, ...args,
    ])
  }

  private failure() {
    return new Exception('AWS Client VPN revocation cannot be confirmed.', {
      status: 503,
      code: 'E_AWS_CLIENT_VPN_REVOCATION_UNCONFIRMED',
    })
  }
}
