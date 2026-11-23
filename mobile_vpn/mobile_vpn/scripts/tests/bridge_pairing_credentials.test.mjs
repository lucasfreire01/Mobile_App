import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  createBridgePairingCredentials,
  verifyBridgePairingCode,
  verifyBridgePairingToken,
} from '../../app/services/bridge_pairing_credentials.ts'

test('stores hashes and keeps PC confirmation separate from its relay token', () => {
  const { session, confirmationCode, bridgeToken } = createBridgePairingCredentials(1000)
  assert.equal(verifyBridgePairingCode(session, confirmationCode, 1001), true)
  assert.equal(verifyBridgePairingToken(session, bridgeToken, 1001), true)
  assert.equal(JSON.stringify(session).includes(confirmationCode), false)
  assert.equal(JSON.stringify(session).includes(bridgeToken), false)
  assert.equal(verifyBridgePairingCode(session, bridgeToken, 1001), false)
  assert.equal(verifyBridgePairingToken(session, confirmationCode, 1001), false)
})

test('does not authorize credentials from a different PC session', () => {
  const first = createBridgePairingCredentials(1000)
  const other = createBridgePairingCredentials(1000)
  assert.notEqual(first.session.id, other.session.id)
  assert.equal(verifyBridgePairingCode(first.session, other.confirmationCode, 1001), false)
  assert.equal(verifyBridgePairingToken(first.session, other.bridgeToken, 1001), false)
})

test('rejects expired credentials at the exact deadline and invalid timestamps', () => {
  const { session, confirmationCode, bridgeToken } = createBridgePairingCredentials(1000)
  assert.equal(verifyBridgePairingCode(session, confirmationCode, session.expiresAt - 1), true)
  assert.equal(verifyBridgePairingToken(session, bridgeToken, session.expiresAt - 1), true)
  for (const now of [session.expiresAt, session.expiresAt + 1, NaN, Infinity]) {
    assert.equal(verifyBridgePairingCode(session, confirmationCode, now), false)
    assert.equal(verifyBridgePairingToken(session, bridgeToken, now), false)
  }
})

test('accepts typed code casing and whitespace without weakening the PC token', () => {
  const { session, confirmationCode, bridgeToken } = createBridgePairingCredentials(1000)
  assert.equal(verifyBridgePairingCode(session, ` ${confirmationCode.toLowerCase()} `, 1001), true)
  assert.equal(verifyBridgePairingToken(session, ` ${bridgeToken} `, 1001), false)
  for (const value of [null, undefined, {}, '', 'a'.repeat(10000)]) {
    assert.equal(verifyBridgePairingCode(session, value, 1001), false)
    assert.equal(verifyBridgePairingToken(session, value, 1001), false)
  }
})

test('fails closed if stored hashes are invalid', () => {
  const { session, confirmationCode, bridgeToken } = createBridgePairingCredentials(1000)
  assert.equal(verifyBridgePairingCode({ ...session, confirmationCodeHash: 'bad' }, confirmationCode, 1001), false)
  assert.equal(verifyBridgePairingToken({ ...session, bridgeTokenHash: '' }, bridgeToken, 1001), false)
})
