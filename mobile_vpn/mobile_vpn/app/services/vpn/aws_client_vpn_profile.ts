import { Exception } from '@adonisjs/core/exceptions'
import { createPrivateKey, X509Certificate } from 'node:crypto'
import type { VpnProfile } from '#services/vpn/types'

const clientCertificatePattern =
  /^-----BEGIN CERTIFICATE-----\n[A-Za-z0-9+/=\n]+\n-----END CERTIFICATE-----$/
const privateKeyPattern =
  /^-----BEGIN (PRIVATE KEY|RSA PRIVATE KEY|EC PRIVATE KEY)-----\n[A-Za-z0-9+/=\n]+\n-----END \1-----$/
const caBlockPattern =
  /(?:^|\n)<ca>\n(?:-----BEGIN CERTIFICATE-----\n[A-Za-z0-9+/=\n]+\n-----END CERTIFICATE-----\n)+<\/ca>(?=\n|$)/
const supportedDirectives = new Set([
  'client',
  'dev',
  'proto',
  'remote',
  'remote-random-hostname',
  'resolv-retry',
  'nobind',
  'persist-key',
  'persist-tun',
  'remote-cert-tls',
  'verify-x509-name',
  'cipher',
  'data-ciphers',
  'data-ciphers-fallback',
  'auth',
  'auth-nocache',
  'reneg-sec',
  'explicit-exit-notify',
  'verb',
])

function invalidProfile() {
  return new Exception('AWS Client VPN profile or client identity is invalid.', {
    status: 502,
    code: 'E_AWS_CLIENT_VPN_PROFILE_INVALID',
  })
}

export function buildAwsClientVpnProfile({
  endpointId,
  region,
  exportedProfile,
  certificatePem,
  privateKeyPem,
}: {
  endpointId: string
  region: string
  exportedProfile: string
  certificatePem: string
  privateKeyPem: string
}): VpnProfile {
  const exported = exportedProfile.replaceAll('\r\n', '\n').trim()
  const certificate = certificatePem.replaceAll('\r\n', '\n').trim()
  const key = privateKeyPem.replaceAll('\r\n', '\n').trim()
  const caBlock = exported.match(caBlockPattern)?.[0]
  if (
    !/^cvpn-endpoint-[0-9a-f]+$/.test(endpointId) ||
    !/^[a-z]{2}(?:-[a-z0-9]+)+-[0-9]+$/.test(region) ||
    !caBlock ||
    exported.includes('\r') ||
    exported.includes('\0') ||
    !clientCertificatePattern.test(certificate) ||
    !privateKeyPattern.test(key)
  ) {
    throw invalidProfile()
  }

  const lines = exported.replace(caBlockPattern, '\n').split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#') && !line.startsWith(';'))
  const remotes = lines.filter((line) => /^remote\s/.test(line))
  const protocols = lines.filter((line) => /^proto\s/.test(line))
  const [remoteDirective, host, port, remoteProtocol, ...extra] = remotes[0]?.split(/\s+/) ?? []
  const protocol = protocols[0]?.split(/\s+/)[1]
  const remoteHost =
    `${endpointId}.prod.clientvpn.${region}.amazonaws.com${region.startsWith('cn-') ? '.cn' : ''}`
  if (
    lines.some((line) => !supportedDirectives.has(line.split(/\s+/, 1)[0])) ||
    remotes.length !== 1 ||
    remoteDirective !== 'remote' ||
    host !== remoteHost ||
    (port !== '443' && port !== '1194') ||
    extra.length !== 0 ||
    protocols.length !== 1 ||
    (protocol !== 'udp' && protocol !== 'tcp-client') ||
    (remoteProtocol !== undefined && remoteProtocol !== protocol &&
      !(protocol === 'tcp-client' && remoteProtocol === 'tcp')) ||
    !lines.includes('client') ||
    !lines.includes('remote-random-hostname') ||
    !lines.includes('remote-cert-tls server')
  ) {
    throw invalidProfile()
  }

  try {
    const caCertificates = caBlock.matchAll(
      /-----BEGIN CERTIFICATE-----\n[A-Za-z0-9+/=\n]+\n-----END CERTIFICATE-----/g
    )
    for (const [ca] of caCertificates) {
      new X509Certificate(ca)
    }
    if (!new X509Certificate(certificate).checkPrivateKey(createPrivateKey(key))) throw invalidProfile()
  } catch {
    throw invalidProfile()
  }
  return {
    format: 'openvpn',
    content: `${exported}\n\n<cert>\n${certificate}\n</cert>\n<key>\n${key}\n</key>\n`,
  }
}
