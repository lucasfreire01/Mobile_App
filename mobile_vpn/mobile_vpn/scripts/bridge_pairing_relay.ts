import { execFile } from 'node:child_process'
import { chmod, lstat, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { isIPv4 } from 'node:net'
import { randomBytes, randomUUID } from 'node:crypto'

type Device = { ip: string; mac: string }
type PublicSession = { sessionId: string; expiresAt: number }
type Session = PublicSession & { bridgeToken: string }
type Receipt = 'submitted' | 'failed'
type Options = {
  fetch?: typeof fetch
  submit?: typeof submitTrustedGateway
  identity?: { bridgeId: string; token: string }
  onConfirmation?: (code: string, expiresAt: number) => void
  onEvent: (event: 'submitted' | 'failed' | 'unavailable') => void
}

function command(file: string, args: string[], input?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      file,
      args,
      { timeout: 10_000, maxBuffer: 65_536, windowsHide: true },
      (error, stdout) => {
        if (error) reject(new Error('Não foi possível validar ou acessar o gateway por SSH.'))
        else resolve(stdout)
      }
    )
    child.stdin?.on('error', () => {})
    child.stdin?.end(input)
  })
}

/** Match public keys already trusted by the PC, including entries with hashed hostnames. */
export function trustedGatewayKeys(scanned: string, known: string) {
  const trusted = new Set<string>()
  const revoked = new Set<string>()
  for (const line of known.split('\n')) {
    const parts = line.trim().split(/\s+/)
    if (!parts[0] || parts[0].startsWith('#')) continue
    if (parts[0] === '@revoked' && parts.length >= 4) revoked.add(`${parts[2]} ${parts[3]}`)
    else if (!parts[0].startsWith('@') && parts.length >= 3) trusted.add(`${parts[1]} ${parts[2]}`)
  }
  return [
    ...new Set(
      scanned.split('\n').flatMap((line) => {
        const parts = line.trim().split(/\s+/)
        if (parts.length < 3 || parts[0].startsWith('#')) return []
        const key = `${parts[1]} ${parts[2]}`
        return trusted.has(key) && !revoked.has(key) ? [key] : []
      })
    ),
  ]
}

/** Never put the enrollment code in arguments, files, URLs, or diagnostics. */
export async function submitTrustedGateway(device: Device, enrollmentCode: string) {
  if (
    !isIPv4(device.ip) ||
    !/^(?:[a-f0-9]{2}:){5}[a-f0-9]{2}$/i.test(device.mac) ||
    !/^[A-Za-z0-9_-]{43}$/.test(enrollmentCode)
  )
    throw new Error('Entrega de pareamento inválida.')
  const known = await readFile(join(homedir(), '.ssh', 'known_hosts'), 'utf8')
  const scanned = await command('ssh-keyscan', ['-T', '3', '-t', 'ed25519,rsa', device.ip])
  const keys = trustedGatewayKeys(scanned, known)
  if (!keys.length)
    throw new Error('A identidade SSH deste gateway ainda não é confiável neste PC.')
  const directory = await mkdtemp(join(tmpdir(), 'saganexus-pairing-'))
  try {
    const hosts = join(directory, 'known_hosts')
    await writeFile(hosts, keys.map((key) => `${device.ip} ${key}\n`).join(''), { mode: 0o600 })
    const script = [
      'set -eu',
      'IFS= read -r expected_mac',
      'IFS= read -r enrollment_code',
      'actual_mac=$(cat /sys/class/net/eth0/address)',
      '[ "$actual_mac" = "$expected_mac" ] || exit 41',
      'printf "code=%s" "$enrollment_code" | env REQUEST_METHOD=POST HTTPS=on HTTP_HOST=localhost HTTP_ACCEPT=application/json CONTENT_LENGTH=48 /www/cgi-bin/saganexus_enroll.cgi',
    ].join('\n')
    const output = await command(
      'ssh',
      [
        '-o',
        'BatchMode=yes',
        '-o',
        'ConnectTimeout=5',
        '-o',
        'StrictHostKeyChecking=yes',
        '-o',
        `UserKnownHostsFile=${hosts}`,
        '-o',
        `GlobalKnownHostsFile=${process.platform === 'win32' ? 'NUL' : '/dev/null'}`,
        `root@${device.ip}`,
        script,
      ],
      `${device.mac.toLowerCase()}\n${enrollmentCode}\n`
    )
    const body = output
      .split(/\r?\n\r?\n/)
      .slice(1)
      .join('\n\n')
    let accepted = false
    try {
      accepted = JSON.parse(body).accepted === true
    } catch {
      /* Fail closed for older CGI versions. */
    }
    if (!accepted) throw new Error('O gateway não confirmou o recebimento do pareamento.')
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

function backendApi(apiUrl: string) {
  const url = new URL(apiUrl)
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !['/', '/api/v1', '/api/v1/'].includes(url.pathname)
  ) {
    throw new Error('A ponte exige uma URL HTTPS válida do backend SagaNexus.')
  }
  return `${url.origin}/api/v1`
}

type Installation = {
  apiUrl: string
  bridgeId: string
  bridgeToken?: string
  installationToken?: string
}

async function saveInstallation(path: string, value: Installation) {
  const temporary = `${path}.${randomUUID()}.tmp`
  try {
    await writeFile(temporary, JSON.stringify(value), { mode: 0o600, flag: 'wx' })
    await rename(temporary, path)
  } finally {
    await rm(temporary, { force: true })
  }
}

/** Credential is durable before activation. Retrying cannot strand a successfully activated PC. */
export async function prepareBridgeInstallation(path: string, request: typeof fetch = fetch) {
  const stat = await lstat(path)
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 8192)
    throw new Error('Configuração da ponte inválida.')
  await chmod(path, 0o600)
  let parsed: unknown
  try {
    parsed = JSON.parse(await readFile(path, 'utf8'))
  } catch {
    throw new Error('Configuração da ponte inválida.')
  }
  if (!parsed || typeof parsed !== 'object') throw new Error('Configuração da ponte inválida.')
  const input = parsed as Installation
  if (
    typeof input.apiUrl !== 'string' ||
    typeof input.bridgeId !== 'string' ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(input.bridgeId)
  )
    throw new Error('Configuração da ponte inválida.')
  const apiUrl = backendApi(input.apiUrl)
  if (
    input.bridgeToken !== undefined &&
    (typeof input.bridgeToken !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(input.bridgeToken))
  )
    throw new Error('Credencial da ponte inválida.')
  if (
    input.installationToken !== undefined &&
    (typeof input.installationToken !== 'string' ||
      !/^[A-Za-z0-9_-]{43}$/.test(input.installationToken))
  )
    throw new Error('Autorização de instalação inválida.')
  const isNew = !input.bridgeToken
  if (isNew && !input.installationToken) throw new Error('Instalação da ponte não autorizada.')
  const bridgeToken = input.bridgeToken ?? randomBytes(32).toString('base64url')
  const config: Installation = {
    apiUrl,
    bridgeId: input.bridgeId,
    bridgeToken,
    ...(input.installationToken ? { installationToken: input.installationToken } : {}),
  }
  if (isNew) await saveInstallation(path, config)
  const activate = (token: string) =>
    request(`${apiUrl}/gateway-bridges/${config.bridgeId}/activate`, {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(8000),
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ bridgeToken }),
    })
  let response = await activate(isNew ? config.installationToken! : bridgeToken)
  if (response.status === 403 && !isNew && config.installationToken)
    response = await activate(config.installationToken)
  if (!response.ok) throw new Error('Não foi possível autenticar a ponte.')
  let body: Record<string, unknown>
  try {
    body = (await response.json()) as Record<string, unknown>
  } catch {
    throw new Error('Resposta de ativação inválida.')
  }
  if (
    !body ||
    body.bridgeId !== config.bridgeId ||
    typeof body.expiresAt !== 'number' ||
    !Number.isFinite(body.expiresAt) ||
    body.expiresAt <= Date.now()
  )
    throw new Error('Resposta de ativação inválida.')
  // Remove the one-time grant after activation is confirmed; never print either credential.
  await saveInstallation(path, { apiUrl, bridgeId: config.bridgeId, bridgeToken })
  return { apiUrl, identity: { bridgeId: config.bridgeId, token: bridgeToken } }
}

export async function bootstrapBridgeInstallation(
  path: string,
  input: { apiUrl: string; bridgeId: string; installationToken: string },
  request: typeof fetch = fetch,
) {
  await saveInstallation(path, input)
  return prepareBridgeInstallation(path, request)
}

export class BridgePairingRelay {
  private base: string
  private options: Options
  private session?: Session
  private receipt?: Receipt
  private busy = false
  private unavailable = false

  constructor(apiUrl: string, options: Options) {
    this.base = `${backendApi(apiUrl)}/gateway-bridge-sessions`
    this.options = options
  }

  publicSession(): PublicSession | undefined {
    if (!this.session || Date.now() >= this.session.expiresAt) return undefined
    return { sessionId: this.session.sessionId, expiresAt: this.session.expiresAt }
  }

  private async request(path: string, body?: unknown, token?: string) {
    const response = await (this.options.fetch ?? fetch)(`${this.base}${path}`, {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(8000),
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    if (!response.ok) throw new Error('Backend de pareamento indisponível.')
    return (await response.json()) as Record<string, unknown>
  }

  async tick(devices: Device[]) {
    if (this.busy) return
    this.busy = true
    try {
      if (!this.publicSession()) {
        this.session = undefined
        this.receipt = undefined
        if (!devices.length) return
        const identity = this.options.identity
        if (!identity) throw new Error('Ponte sem credencial de instalação.')
        const created = await this.request(
          '',
          { bridgeId: identity.bridgeId, gatewayMacs: devices.map((device) => device.mac) },
          identity.token
        )
        if (
          typeof created.sessionId !== 'string' ||
          !/^[a-f0-9-]{36}$/i.test(created.sessionId) ||
          typeof created.expiresAt !== 'number' ||
          !Number.isFinite(created.expiresAt) ||
          created.expiresAt <= Date.now() ||
          typeof created.bridgeToken !== 'string' ||
          !/^[A-Za-z0-9_-]{43}$/.test(created.bridgeToken)
        )
          throw new Error('Sessão inválida.')
        this.session = {
          sessionId: created.sessionId,
          expiresAt: created.expiresAt,
          bridgeToken: created.bridgeToken,
        }
        return
      }
      const session = this.session!
      if (!this.receipt) {
        const delivery = await this.request(
          `/${session.sessionId}/poll`,
          undefined,
          session.bridgeToken
        )
        if (delivery.status !== 'approved') return
        const device = devices.find(
          (item) => item.mac.toLowerCase() === String(delivery.gatewayMac).toLowerCase()
        )
        try {
          if (
            !device ||
            typeof delivery.enrollmentCode !== 'string' ||
            !/^[A-Za-z0-9_-]{43}$/.test(delivery.enrollmentCode)
          ) {
            throw new Error('Gateway selecionado indisponível.')
          }
          await (this.options.submit ?? submitTrustedGateway)(device, delivery.enrollmentCode)
          this.receipt = 'submitted'
        } catch {
          this.receipt = 'failed'
        }
        this.options.onEvent(this.receipt)
      }
      // Retain the receipt across HTTP failures so retries never repeat the device mutation.
      const receipt = this.receipt
      await this.request(
        `/${session.sessionId}/result`,
        { outcome: receipt },
        session.bridgeToken
      )
      this.receipt = undefined
      if (receipt === 'failed') {
        this.session = undefined
        // Renew within this tick: discovery must not wait for the next 4s poll.
        this.busy = false
        await this.tick(devices)
      }
      this.unavailable = false
    } catch {
      if (!this.unavailable) this.options.onEvent('unavailable')
      this.unavailable = true
    } finally {
      this.busy = false
    }
  }
}
