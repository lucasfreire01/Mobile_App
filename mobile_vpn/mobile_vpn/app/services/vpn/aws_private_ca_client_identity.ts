import { Exception } from '@adonisjs/core/exceptions'
import { execFile } from 'node:child_process'
import { createPrivateKey, generateKeyPair, X509Certificate } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

const run = promisify(execFile)
const pair = promisify(generateKeyPair)
const authorityPattern = /^arn:(aws(?:-cn|-us-gov)?):acm-pca:([a-z0-9-]+):[0-9]{12}:certificate-authority\/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/
const identityPattern = /^saganexus-([0-9a-f]{32})$/
const csrPattern = /^-----BEGIN CERTIFICATE REQUEST-----\n[A-Za-z0-9+/=\n]+\n-----END CERTIFICATE REQUEST-----$/
const TLS_CLIENT_AUTH_OID = '1.3.6.1.5.5.7.3.2'

type ExecuteAws = (args: string[]) => Promise<unknown>
const executeAws: ExecuteAws = async (args) => {
  const { stdout } = await run('aws', [...args, '--output', 'json', '--no-cli-pager', '--no-cli-auto-prompt'], {
    timeout: 10_000,
    maxBuffer: 1024 * 1024,
  })
  return JSON.parse(stdout)
}

function invalidIdentity() {
  return new Exception('AWS Private CA client identity is invalid.', {
    status: 422,
    code: 'E_AWS_PRIVATE_CA_IDENTITY_INVALID',
  })
}

function invalidResponse() {
  return new Exception('AWS Private CA returned an invalid client certificate response.', {
    status: 502,
    code: 'E_AWS_PRIVATE_CA_RESPONSE_INVALID',
  })
}

export type AwsPrivateCaClientKey = {
  identity: string
  csrPem: string
  privateKeyPem: string
}

/** The caller must persist the key and CSR encrypted before requesting issuance. */
export async function generateAwsPrivateCaClientKey(identity: string): Promise<AwsPrivateCaClientKey> {
  if (!identityPattern.test(identity)) throw invalidIdentity()
  try {
    const { privateKey: privateKeyPem } = await pair('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    })
    const csrPem = await new Promise<string>((resolve, reject) => {
      const child = execFile(
        'openssl',
        ['req', '-new', '-sha256', '-key', '/dev/stdin', '-subj', `/CN=${identity}`],
        { timeout: 10_000, maxBuffer: 64 * 1024 },
        (error, stdout) => (error ? reject(error) : resolve(stdout.trim()))
      )
      child.stdin?.on('error', reject)
      child.stdin?.end(privateKeyPem)
    })
    if (!csrPattern.test(csrPem)) throw invalidIdentity()
    return { identity, csrPem, privateKeyPem }
  } catch {
    throw new Exception('Could not generate an AWS VPN client key and signing request.', {
      status: 500,
      code: 'E_AWS_PRIVATE_CA_CLIENT_KEY_FAILED',
    })
  }
}

export default class AwsPrivateCaClientIdentity {
  private readonly partition: string
  private readonly region: string

  constructor(
    private readonly authorityArn: string,
    private readonly execute: ExecuteAws = executeAws
  ) {
    const authority = authorityArn.match(authorityPattern)
    if (!authority) {
      throw new Exception('The AWS Private CA ARN is not valid.', {
        status: 503,
        code: 'E_VPN_PROVIDER_NOT_CONFIGURED',
      })
    }
    this.partition = authority[1]
    this.region = authority[2]
  }

  /** The caller must persist the returned ARN before retrieving or distributing the certificate. */
  async issue({ identity, csrPem }: Pick<AwsPrivateCaClientKey, 'identity' | 'csrPem'>) {
    const identityToken = identity.match(identityPattern)?.[1]
    if (!identityToken || !csrPattern.test(csrPem)) throw invalidIdentity()
    const folder = await mkdtemp(join(tmpdir(), 'saganexus-aws-pca-csr-'))
    try {
      const path = join(folder, 'client.csr')
      await writeFile(path, csrPem, { flag: 'wx', mode: 0o600 })
      const issued = await this.call('issue-certificate', [
        '--csr', `fileb://${path}`,
        '--signing-algorithm', 'SHA256WITHRSA',
        '--template-arn', `arn:${this.partition}:acm-pca:::template/EndEntityClientAuthCertificate/V1`,
        '--validity', 'Value=90,Type=DAYS',
        '--idempotency-token', identityToken,
      ])
      const certificateArn = (issued as { CertificateArn?: unknown } | null)?.CertificateArn
      if (typeof certificateArn !== 'string' || !this.owns(certificateArn)) throw invalidResponse()
      return certificateArn
    } finally {
      await rm(folder, { recursive: true, force: true })
    }
  }

  async getRootAuthorityCertificate() {
    const result = await this.call('get-certificate-authority-certificate', []) as {
      Certificate?: unknown
      CertificateChain?: unknown
    } | null
    try {
      if (
        typeof result?.Certificate !== 'string' ||
        (result.CertificateChain != null && result.CertificateChain !== '')
      ) throw invalidResponse()
      const root = new X509Certificate(result.Certificate)
      if (!root.ca || !root.checkIssued(root) || !root.verify(root.publicKey)) throw invalidResponse()
      return result.Certificate
    } catch {
      throw invalidResponse()
    }
  }

  async getCertificate(certificateArn: string, clientKey: AwsPrivateCaClientKey, authorityPem: string) {
    if (!this.owns(certificateArn) || !identityPattern.test(clientKey.identity)) {
      throw invalidIdentity()
    }
    const result = await this.call('get-certificate', ['--certificate-arn', certificateArn])
    const certificatePem = (result as { Certificate?: unknown } | null)?.Certificate
    if (typeof certificatePem !== 'string') throw invalidResponse()
    try {
      const certificate = new X509Certificate(certificatePem)
      const authority = new X509Certificate(authorityPem)
      if (
        certificate.ca ||
        certificate.subject !== `CN=${clientKey.identity}` ||
        !certificate.keyUsage?.includes(TLS_CLIENT_AUTH_OID) ||
        BigInt(`0x${certificate.serialNumber}`) !== this.certificateSerial(certificateArn) ||
        certificate.validFromDate.getTime() > Date.now() ||
        certificate.validToDate.getTime() <= Date.now() ||
        !certificate.checkIssued(authority) ||
        !certificate.verify(authority.publicKey) ||
        !certificate.checkPrivateKey(createPrivateKey(clientKey.privateKeyPem))
      ) {
        throw invalidResponse()
      }
      return { certificatePem, serial: certificate.serialNumber }
    } catch {
      throw invalidResponse()
    }
  }

  /** Revokes at PCA. AWS Client VPN needs independent confirmation of its imported CRL. */
  async revoke(certificateArn: string, serial: string) {
    if (!/^[0-9a-fA-F]{1,40}$/.test(serial) || BigInt(`0x${serial}`) !==
        this.certificateSerial(certificateArn)) {
      throw invalidIdentity()
    }
    await this.call('revoke-certificate', [
      '--certificate-serial', serial,
      '--revocation-reason', 'CESSATION_OF_OPERATION',
    ])
  }

  private owns(certificateArn: string) {
    const prefix = `${this.authorityArn}/certificate/`
    return certificateArn.startsWith(prefix) && /^[0-9]{1,50}$/.test(certificateArn.slice(prefix.length))
  }

  certificateSerial(certificateArn: string) {
    if (!this.owns(certificateArn)) throw invalidIdentity()
    return BigInt(certificateArn.slice(certificateArn.lastIndexOf('/') + 1))
  }

  private async call(
    action: 'issue-certificate' | 'get-certificate' | 'revoke-certificate' | 'get-certificate-authority-certificate',
    args: string[]
  ) {
    try {
      return await this.execute([
        'acm-pca', action,
        '--certificate-authority-arn', this.authorityArn,
        '--region', this.region,
        ...args,
      ])
    } catch {
      throw new Exception('AWS Private CA client certificate request failed.', {
        status: 503,
        code: 'E_AWS_PRIVATE_CA_REQUEST_FAILED',
      })
    }
  }
}
