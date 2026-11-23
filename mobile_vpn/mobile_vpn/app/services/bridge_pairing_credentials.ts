import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'

const SESSION_TTL_MS = 15 * 60 * 1000

export type BridgePairingCredentials = {
  id: string
  expiresAt: number
  confirmationCodeHash: string
  bridgeTokenHash: string
}

function digest(value: string) {
  return createHash('sha256').update(value).digest('hex')
}

function matches(value: string, expectedHash: string) {
  if (!/^[a-f0-9]{64}$/.test(expectedHash)) return false
  return timingSafeEqual(Buffer.from(digest(value), 'hex'), Buffer.from(expectedHash, 'hex'))
}

/** Return secrets only to the PC over HTTPS; publish only session.id on the LAN. */
export function createBridgePairingCredentials(now = Date.now()) {
  const confirmationCode = randomBytes(8).toString('hex').toUpperCase()
  const bridgeToken = randomBytes(32).toString('base64url')
  const session: BridgePairingCredentials = {
    id: randomUUID(),
    expiresAt: now + SESSION_TTL_MS,
    confirmationCodeHash: digest(confirmationCode),
    bridgeTokenHash: digest(bridgeToken),
  }
  return { session, confirmationCode, bridgeToken }
}

/** The authenticated app submits the code displayed on the selected PC. */
export function verifyBridgePairingCode(
  session: BridgePairingCredentials,
  code: unknown,
  now = Date.now()
) {
  if (!Number.isFinite(now) || !Number.isFinite(session.expiresAt) || now >= session.expiresAt)
    return false
  if (typeof code !== 'string') return false
  const normalized = code.trim().toUpperCase()
  return /^[A-F0-9]{16}$/.test(normalized) && matches(normalized, session.confirmationCodeHash)
}

/** The PC proves possession of its separate secret when polling the HTTPS relay. */
export function verifyBridgePairingToken(
  session: BridgePairingCredentials,
  token: unknown,
  now = Date.now()
) {
  if (!Number.isFinite(now) || !Number.isFinite(session.expiresAt) || now >= session.expiresAt)
    return false
  return (
    typeof token === 'string' &&
    /^[A-Za-z0-9_-]{43}$/.test(token) &&
    matches(token, session.bridgeTokenHash)
  )
}
