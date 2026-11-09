import { test } from '@japa/runner'
import {
  createSshHostKeyVerifier,
  getSshHostKeyFingerprint,
  isExpectedSshHostKey,
} from '#services/gateway_ssh_service'

test.group('Gateway SSH host key verification', () => {
  test('creates and verifies a SHA-256 fingerprint for the gateway host key', ({ assert }) => {
    const hostKey = Buffer.from('browan-gateway-host-key')
    const fingerprint = getSshHostKeyFingerprint(hostKey)

    assert.equal(fingerprint, 'SHA256:ug0Ud/RFuyhL26rvDCacTFqDl++gDqo5qgqXK06R5II')
    assert.isTrue(isExpectedSshHostKey(hostKey, fingerprint))
    assert.isTrue(isExpectedSshHostKey(hostKey, `${fingerprint}==`))
  })

  test('rejects a different gateway host key', ({ assert }) => {
    const expectedHostKey = Buffer.from('browan-gateway-host-key')
    const unexpectedHostKey = Buffer.from('unknown-gateway-host-key')

    assert.isFalse(
      isExpectedSshHostKey(unexpectedHostKey, getSshHostKeyFingerprint(expectedHostKey))
    )
  })

  test('keeps the mismatch signal after rejecting an unexpected key', ({ assert }) => {
    const expectedHostKey = Buffer.from('browan-gateway-host-key')
    const verifier = createSshHostKeyVerifier(getSshHostKeyFingerprint(expectedHostKey))

    assert.isFalse(verifier.verify(Buffer.from('unknown-gateway-host-key')))
    assert.isTrue(verifier.wasRejected())
    assert.isTrue(verifier.verify(expectedHostKey))
    assert.isTrue(verifier.wasRejected())
  })
})
