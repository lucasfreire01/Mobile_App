import { Exception } from '@adonisjs/core/exceptions'
import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { promisify } from 'node:util'
import env from '#start/env'
import AwsClientIdentityStore from '#services/vpn/aws_client_identity_store'
import AwsPrivateCaClientIdentity, { generateAwsPrivateCaClientKey } from '#services/vpn/aws_private_ca_client_identity'
import AwsClientVpnRevocation from '#services/vpn/aws_client_vpn_revocation'
import { buildAwsClientVpnProfile } from '#services/vpn/aws_client_vpn_profile'
import type { SessionAddressVpnProvider, VpnResources } from '#services/vpn/types'
import { ensureAllowedSshAddress } from '#services/gateway_ssh_address_policy'

const run = promisify(execFile)

export default class AwsManagedClientVpnProvider implements SessionAddressVpnProvider {
  readonly id = 'aws_client_vpn_managed'
  readonly lifecycle = 'managed'
  readonly managementAddressMode = 'session'
  readonly profileFormats = ['openvpn'] as const

  private readonly endpointId: string
  private readonly region: string
  private readonly authority: AwsPrivateCaClientIdentity
  private readonly store = new AwsClientIdentityStore()
  private readonly revocation: AwsClientVpnRevocation

  constructor() {
    this.endpointId = env.get('AWS_CLIENT_VPN_ENDPOINT_ID') ?? ''
    this.region = env.get('AWS_CLIENT_VPN_REGION') ?? ''
    const authorityArn = env.get('AWS_CLIENT_VPN_CA_ARN') ?? ''
    if (!/^cvpn-endpoint-[0-9a-f]+$/.test(this.endpointId) || !this.region) {
      throw new Exception('Managed AWS Client VPN endpoint configuration is incomplete.', {
        status: 503,
        code: 'E_VPN_PROVIDER_NOT_CONFIGURED',
      })
    }
    this.authority = new AwsPrivateCaClientIdentity(authorityArn)
    this.revocation = new AwsClientVpnRevocation(this.endpointId, this.region)
  }

  async createGateway(
    _name: string,
    _managementIp: null,
    onNetworkCreated: (certificateArn: string) => Promise<void>
  ): Promise<VpnResources> {
    const connectorId = `saganexus-${randomUUID().replaceAll('-', '')}`
    const key = await generateAwsPrivateCaClientKey(connectorId)
    const identity = {
      connectorId,
      identity: key.identity,
      csrPem: key.csrPem,
      privateKeyPem: key.privateKeyPem,
      certificatePem: null,
      certificateArn: null,
      certificateSerial: null,
      status: 'issuing' as const,
    }
    await this.store.reserve(identity)
    try {
      const certificateArn = await this.authority.issue(key)
      const issued = { ...identity, certificateArn, status: 'issuing' as const }
      await this.store.update(issued)
      await onNetworkCreated(certificateArn)
      const authorityPem = await this.authority.getRootAuthorityCertificate()
      const certificate = await this.authority.getCertificate(certificateArn, key, authorityPem)
      await this.store.update({
        ...issued,
        certificatePem: certificate.certificatePem,
        certificateSerial: certificate.serial,
      })
      return { networkId: certificateArn, connectorId }
    } catch (error) {
      throw error
    }
  }

  async getProfile(connectorId: string) {
    const identity = await this.store.get(connectorId)
    if (
      !identity?.certificatePem ||
      !identity.certificateArn ||
      !['issuing', 'active'].includes(identity.status)
    ) {
      throw new Exception('AWS VPN client identity is not ready.', {
        status: 503,
        code: 'E_AWS_CLIENT_IDENTITY_NOT_READY',
      })
    }
    const authorityPem = await this.authority.getRootAuthorityCertificate()
    const certificate = await this.authority.getCertificate(
      identity.certificateArn,
      identity,
      authorityPem
    )
    const exported = await run('aws', [
      'ec2', 'export-client-vpn-client-configuration',
      '--client-vpn-endpoint-id', this.endpointId,
      '--region', this.region,
      '--output', 'text', '--no-cli-pager', '--no-cli-auto-prompt',
    ], { timeout: 20_000, maxBuffer: 1024 * 1024 })
    const profile = buildAwsClientVpnProfile({
      endpointId: this.endpointId,
      region: this.region,
      exportedProfile: exported.stdout,
      certificatePem: certificate.certificatePem,
      privateKeyPem: identity.privateKeyPem,
    })
    await this.store.update({ ...identity, certificateSerial: certificate.serial, status: 'active' })
    return profile
  }

  async resolveManagementAddress(connectorId: string, signal?: AbortSignal) {
    const identity = await this.store.get(connectorId)
    if (!identity || identity.status !== 'active' || !identity.certificatePem) return null
    if (signal?.aborted) throw new Error('Gateway monitoring cancelled')
    const { stdout } = await run('aws', [
      'ec2', 'describe-client-vpn-connections',
      '--client-vpn-endpoint-id', this.endpointId,
      '--region', this.region,
      '--output', 'json', '--no-cli-pager', '--no-cli-auto-prompt',
      '--query', '{Connections:Connections[].{ClientVpnEndpointId:ClientVpnEndpointId,CommonName:CommonName,ClientIp:ClientIp,Status:Status.Code},NextToken:NextToken}',
    ], { signal, timeout: 20_000, maxBuffer: 2 * 1024 * 1024 })
    if (signal?.aborted) throw new Error('Gateway monitoring cancelled')
    const result = JSON.parse(stdout) as { Connections?: Array<Record<string, unknown>>; NextToken?: unknown }
    if (!Array.isArray(result.Connections) || result.NextToken != null) {
      throw new Exception('AWS Client VPN returned an incomplete session list.', {
        status: 503,
        code: 'E_AWS_CLIENT_VPN_RESPONSE_INVALID',
      })
    }
    const matches = result.Connections.filter((entry) =>
      entry.ClientVpnEndpointId === this.endpointId && entry.CommonName === connectorId && entry.Status === 'active'
    )
    if (matches.length > 1) {
      throw new Exception('AWS reported multiple active sessions for this gateway.', {
        status: 503,
        code: 'E_AWS_CLIENT_VPN_SESSION_AMBIGUOUS',
      })
    }
    return matches.length === 1 && typeof matches[0].ClientIp === 'string'
      ? ensureAllowedSshAddress(matches[0].ClientIp)
      : null
  }

  async deleteGateway(certificateArn: string) {
    const identity = await this.store.getByCertificateArn(certificateArn)
    if (!identity?.certificateArn) {
      throw new Exception('AWS VPN identity cleanup is not ready.', {
        status: 503,
        code: 'E_AWS_CLIENT_IDENTITY_NOT_READY',
      })
    }
    const authorityPem = await this.authority.getRootAuthorityCertificate()
    const serial = identity.certificateSerial ?? this.authority.certificateSerial(certificateArn).toString(16)
    await this.store.update({ ...identity, status: 'revoking' })
    await this.authority.revoke(certificateArn, serial)
    const crlUri = env.get('AWS_CLIENT_VPN_CRL_S3_URI')
    if (!crlUri || !(await this.revocation.importLatestCrl(
      crlUri,
      serial,
      authorityPem
    ))) {
      throw new Exception('AWS Client VPN has not imported the revoked certificate list.', {
        status: 503,
        code: 'E_AWS_CLIENT_VPN_CRL_NOT_IMPORTED',
      })
    }
    const terminated = await this.revocation.terminateRevokedClientSessions(identity.identity)
    if (!terminated) {
      throw new Exception('AWS Client VPN session termination is still pending.', {
        status: 503,
        code: 'E_AWS_CLIENT_VPN_TERMINATION_PENDING',
      })
    }
    await this.store.remove(identity.connectorId)
  }

}
