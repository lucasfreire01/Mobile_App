import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import AwsClientIdentityStore, { type AwsClientIdentity } from '#services/vpn/aws_client_identity_store'

test.group('AWS client identity store', (group) => {
  const store = new AwsClientIdentityStore()
  const identity = (): AwsClientIdentity => ({
    connectorId: `saganexus-${'a'.repeat(32)}`,
    certificateArn: null,
    certificateSerial: null,
    identity: `saganexus-${'a'.repeat(32)}`,
    csrPem: 'synthetic-csr',
    privateKeyPem: 'synthetic-private-key',
    certificatePem: null,
    status: 'issuing',
  })

  group.each.setup(async () => {
    await db.from('aws_vpn_client_identities').delete()
  })

  test('persists identity encrypted and supports lifecycle updates', async ({ assert }) => {
    const record = identity()
    await store.reserve(record)

    const row = await db.from('aws_vpn_client_identities').where('connector_id', record.connectorId).first()
    assert.notInclude(row.encrypted_identity, record.privateKeyPem)
    assert.deepEqual(await store.get(record.connectorId), record)

    const active = {
      ...record,
      certificateArn: 'arn:aws:acm-pca:sa-east-1:123456789012:certificate-authority/12345678-1234-1234-1234-123456789012/certificate/123456789',
      certificateSerial: '010203',
      certificatePem: 'synthetic-certificate',
      status: 'active' as const,
    }
    await store.update(active)
    assert.deepEqual(await store.getByCertificateArn(active.certificateArn), active)
    await store.remove(record.connectorId)
    assert.isNull(await store.get(record.connectorId))
  })
})
