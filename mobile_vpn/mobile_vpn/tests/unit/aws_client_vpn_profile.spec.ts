import { test } from '@japa/runner'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildAwsClientVpnProfile } from '#services/vpn/aws_client_vpn_profile'

const endpointId = 'cvpn-endpoint-0123456789abcdef0'
const region = 'sa-east-1'

test.group('AWS Client VPN profile composition', (group) => {
  let certificatePem: string
  let privateKeyPem: string
  let anotherPrivateKeyPem: string
  let exportedProfile: string

  group.setup(() => {
    const directory = mkdtempSync(join(tmpdir(), 'aws-vpn-test-certificates-'))
    try {
      for (const name of ['gateway', 'other'] as const) {
        execFileSync('openssl', [
          'req', '-new', '-x509', '-newkey', 'rsa:2048', '-nodes',
          '-subj', `/CN=synthetic-${name}`, '-days', '1',
          '-out', join(directory, `${name}.crt`), '-keyout', join(directory, `${name}.key`),
        ], { stdio: 'ignore', timeout: 10_000 })
      }
      certificatePem = readFileSync(join(directory, 'gateway.crt'), 'utf8')
      privateKeyPem = readFileSync(join(directory, 'gateway.key'), 'utf8')
      anotherPrivateKeyPem = readFileSync(join(directory, 'other.key'), 'utf8')
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
    exportedProfile = [
      'client',
      'dev tun',
      'proto udp',
      `remote ${endpointId}.prod.clientvpn.${region}.amazonaws.com 443`,
      'remote-random-hostname',
      'resolv-retry infinite',
      'nobind',
      'remote-cert-tls server',
      'cipher AES-256-GCM',
      'verb 3',
      '<ca>',
      certificatePem.trim(),
      '</ca>',
      'reneg-sec 0',
    ].join('\n')
  })

  test('produces an OpenVPN profile with the client certificate and matching key inline', ({ assert }) => {
    const profile = buildAwsClientVpnProfile({
      endpointId,
      region,
      exportedProfile: exportedProfile.replaceAll('\n', '\r\n'),
      certificatePem,
      privateKeyPem,
    })
    assert.equal(profile.format, 'openvpn')
    assert.isTrue(profile.content.includes(`<cert>\n${certificatePem.trim()}\n</cert>`))
    assert.isTrue(profile.content.includes(`<key>\n${privateKeyPem.trim()}\n</key>`))
    assert.isTrue(profile.content.includes(`<ca>\n${certificatePem.trim()}\n</ca>`))
  })

  test('refuses conflicting credentials and commands or destinations outside the exported profile contract', ({
    assert,
  }) => {
    const inputs = { endpointId, region, exportedProfile, certificatePem, privateKeyPem }
    const cases = [
      { ...inputs, privateKeyPem: anotherPrivateKeyPem },
      { ...inputs, endpointId: 'cvpn-endpoint-fffffffffffffffff' },
      { ...inputs, exportedProfile: `${exportedProfile}\nauth-user-pass\n` },
      { ...inputs, exportedProfile: `${exportedProfile}\nup /path/not-executed\n` },
      { ...inputs, exportedProfile: `${exportedProfile}\nkey /path/not-read\n` },
      { ...inputs, exportedProfile: exportedProfile.replace(certificatePem.trim(), '-----BEGIN CERTIFICATE-----\nAA==\n-----END CERTIFICATE-----') },
      { ...inputs, exportedProfile: exportedProfile.replace('amazonaws.com 443', 'amazonaws.com 21') },
      { ...inputs, exportedProfile: exportedProfile.replace('amazonaws.com 443', 'amazonaws.com 443 tcp') },
    ]
    for (const input of cases) {
      assert.throws(() => buildAwsClientVpnProfile(input), /^AWS Client VPN profile or client identity is invalid\.$/)
    }
  })
})
