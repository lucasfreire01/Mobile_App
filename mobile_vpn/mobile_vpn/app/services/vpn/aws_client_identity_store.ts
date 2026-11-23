import encryption from '@adonisjs/core/services/encryption'
import db from '@adonisjs/lucid/services/db'
import { Exception } from '@adonisjs/core/exceptions'

export type AwsClientIdentity = {
  connectorId: string
  certificateArn: string | null
  certificateSerial: string | null
  identity: string
  csrPem: string
  privateKeyPem: string
  certificatePem: string | null
  status: 'issuing' | 'active' | 'revoking' | 'revoked' | 'reconciliation_required'
}

const connectorPattern = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/

export default class AwsClientIdentityStore {
  async reserve(identity: AwsClientIdentity) {
    if (!connectorPattern.test(identity.connectorId)) throw this.invalid()
    await db.table('aws_vpn_client_identities').insert({
      connector_id: identity.connectorId,
      certificate_arn: null,
      certificate_serial: null,
      encrypted_identity: encryption.encrypt(identity),
      status: identity.status,
      created_at: new Date(),
      updated_at: new Date(),
    })
  }

  async get(connectorId: string): Promise<AwsClientIdentity | null> {
    if (!connectorPattern.test(connectorId)) throw this.invalid()
    const row = await db
      .from('aws_vpn_client_identities')
      .where('connector_id', connectorId)
      .first()
    if (!row) return null
    try {
      const identity = encryption.decrypt(row.encrypted_identity) as AwsClientIdentity
      if (identity.connectorId !== connectorId || !identity.identity || !identity.privateKeyPem) {
        throw this.invalid()
      }
      return { ...identity, status: row.status }
    } catch {
      throw this.invalid()
    }
  }

  async getByCertificateArn(certificateArn: string): Promise<AwsClientIdentity | null> {
    if (!certificateArn.startsWith('arn:')) throw this.invalid()
    const row = await db
      .from('aws_vpn_client_identities')
      .where('certificate_arn', certificateArn)
      .first()
    if (!row) return null
    const identity = await this.get(row.connector_id)
    return identity?.certificateArn === certificateArn ? identity : null
  }

  async update(identity: AwsClientIdentity) {
    if (!connectorPattern.test(identity.connectorId)) throw this.invalid()
    const rows = await db
      .from('aws_vpn_client_identities')
      .where('connector_id', identity.connectorId)
      .update({
        certificate_arn: identity.certificateArn,
        certificate_serial: identity.certificateSerial,
        encrypted_identity: encryption.encrypt(identity),
        status: identity.status,
        updated_at: new Date(),
      })
      .returning('connector_id')
    if (rows.length !== 1) throw this.invalid()
  }

  async remove(connectorId: string) {
    if (!connectorPattern.test(connectorId)) throw this.invalid()
    await db.from('aws_vpn_client_identities').where('connector_id', connectorId).delete()
  }

  private invalid() {
    return new Exception('Stored AWS Client VPN identity is invalid.', {
      status: 503,
      code: 'E_AWS_CLIENT_IDENTITY_STORE_INVALID',
    })
  }
}
