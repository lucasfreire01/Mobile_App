import {
  createHash,
  createPublicKey,
  randomBytes,
  randomUUID,
  timingSafeEqual,
  verify,
} from 'node:crypto'
import { Exception } from '@adonisjs/core/exceptions'
import encryption from '@adonisjs/core/services/encryption'
import db from '@adonisjs/lucid/services/db'
import logger from '@adonisjs/core/services/logger'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import {
  gatewayPairingKey,
  lockGatewayForPairing,
  saveGatewayPairing,
} from '#services/gateway_provisioning_service'
import {
  createBridgePairingCredentials,
  verifyBridgePairingToken,
  type BridgePairingCredentials,
} from './bridge_pairing_credentials.js'

const INSTALLATION_TTL_MS = 15 * 60 * 1000
const BRIDGE_TTL_MS = 365 * 24 * 60 * 60 * 1000
const BRIDGE_ACTIVATION_CONTEXT = 'saganexus-bridge-activate:v1'

type RegisteredBridge = {
  id: string
  ownerUserId: number
  expiresAt: number
  state: 'pending' | 'active' | 'revoked'
  tokenHash: string
  packageIssuedAt?: number
  publicKey?: string
}
type Session = BridgePairingCredentials & {
  registeredBridgeId: string
  ownerUserId: number
  gatewayMacs: string[]
  status: 'waiting' | 'approved' | 'submitted' | 'failed'
  approvedBy?: number
  gatewayId?: number
  gatewayMac?: string
  enrollmentCode?: string
}

function fail(status: number, code: string): never {
  throw new Exception('Bridge pairing request could not be authorized.', { status, code })
}
function hash(token: string) {
  return createHash('sha256').update(token).digest('hex')
}
function tokenMatches(token: string, expectedHash: string) {
  return (
    /^[A-Za-z0-9_-]{43}$/.test(token) &&
    /^[a-f0-9]{64}$/.test(expectedHash) &&
    timingSafeEqual(Buffer.from(hash(token), 'hex'), Buffer.from(expectedHash, 'hex'))
  )
}

function activationProofMatches(bridge: RegisteredBridge, token: string, proof: string) {
  if (
    !/^[A-Za-z0-9_-]{43}$/.test(token) ||
    !/^[A-Za-z0-9_-]{86}$/.test(proof)
  ) return false
  const signature = Buffer.from(proof, 'base64url')
  if (signature.length !== 64) return false
  try {
    return verify(
      null,
      Buffer.from(`${BRIDGE_ACTIVATION_CONTEXT}\n${bridge.id}\n${token}`),
      createPublicKey(bridge.publicKey!),
      signature
    )
  } catch {
    return false
  }
}

function canonicalEd25519PublicKey(value: string) {
  try {
    const key = createPublicKey(value)
    if (key.asymmetricKeyType !== 'ed25519') return fail(400, 'E_BRIDGE_PUBLIC_KEY_INVALID')
    return key.export({ type: 'spki', format: 'pem' }).toString()
  } catch {
    return fail(400, 'E_BRIDGE_PUBLIC_KEY_INVALID')
  }
}

export default class BridgePairingService {
  /** Legacy HTTPS package flow; its one-time grant never crosses the LAN. */
  async provisionBridge(userId: number) {
    const installationToken = randomBytes(32).toString('base64url')
    const bridge: RegisteredBridge = {
      id: randomUUID(),
      ownerUserId: userId,
      expiresAt: Date.now() + INSTALLATION_TTL_MS,
      state: 'pending',
      tokenHash: hash(installationToken),
    }
    await db.table('saganexus_shared_cache').insert({
      key: `registered-bridge:${bridge.id}`,
      payload: encryption.encrypt(bridge),
      expires_at: new Date(bridge.expiresAt),
      updated_at: new Date(),
    })
    return { bridgeId: bridge.id, installationToken, expiresAt: bridge.expiresAt }
  }

  async authorizePackageDownload(id: string, installationToken: string) {
    return db.transaction(async (trx) => {
      const bridge = await this.loadBridge(trx, id)
      if (bridge.state !== 'pending' || bridge.packageIssuedAt || !tokenMatches(installationToken, bridge.tokenHash))
        return fail(403, 'E_BRIDGE_PACKAGE_CREDENTIAL_INVALID')
      bridge.packageIssuedAt = Date.now()
      await this.saveBridge(trx, bridge)
      return { bridgeId: bridge.id, installationToken, expiresAt: bridge.expiresAt }
    })
  }

  async revokeInstallationGrant(id: string, installationToken: string) {
    return db.transaction(async (trx) => {
      const bridge = await this.loadBridge(trx, id)
      if (bridge.state !== 'pending' || !tokenMatches(installationToken, bridge.tokenHash)) return
      bridge.state = 'revoked'
      bridge.tokenHash = ''
      bridge.expiresAt = Date.now()
      await this.saveBridge(trx, bridge)
    })
  }

  /** Bind an already-discovered PC public identity to the authenticated account. */
  async registerBridge(userId: number, id: string, publicKey: string) {
    if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id)) {
      return fail(400, 'E_BRIDGE_ID_INVALID')
    }
    const canonicalKey = canonicalEd25519PublicKey(publicKey)
    const key = `registered-bridge:${id}`
    return db.transaction(async (trx) => {
      const row = await trx.from('saganexus_shared_cache').where('key', key).forUpdate().first()
      const existing = row ? encryption.decrypt<RegisteredBridge>(row.payload) : null
      const now = Date.now()
      if (existing) {
        if (
          existing.ownerUserId !== userId ||
          existing.publicKey !== canonicalKey ||
          existing.state === 'revoked'
        ) return fail(409, 'E_BRIDGE_IDENTITY_CONFLICT')
        if (existing.state === 'active' || existing.expiresAt > now) {
          return { bridgeId: existing.id, expiresAt: existing.expiresAt }
        }
        existing.state = 'pending'
        existing.tokenHash = ''
        existing.expiresAt = now + INSTALLATION_TTL_MS
        await this.saveBridge(trx, existing)
        return { bridgeId: existing.id, expiresAt: existing.expiresAt }
      }
      const bridge: RegisteredBridge = {
        id,
        ownerUserId: userId,
        expiresAt: now + INSTALLATION_TTL_MS,
        state: 'pending',
        tokenHash: '',
        publicKey: canonicalKey,
      }
      await trx.table('saganexus_shared_cache').insert({
        key,
        payload: encryption.encrypt(bridge),
        expires_at: new Date(bridge.expiresAt),
        updated_at: new Date(),
      })
      return { bridgeId: bridge.id, expiresAt: bridge.expiresAt }
    })
  }

  private async loadBridge(trx: TransactionClientContract, id: string) {
    const row = await trx
      .from('saganexus_shared_cache')
      .where('key', `registered-bridge:${id}`)
      .forUpdate()
      .first()
    const bridge = row ? encryption.decrypt<RegisteredBridge>(row.payload) : null
    if (
      !bridge ||
      !Number.isFinite(bridge.expiresAt) ||
      Date.now() >= bridge.expiresAt ||
      bridge.state === 'revoked'
    ) {
      return fail(403, 'E_BRIDGE_IDENTITY_INVALID')
    }
    return bridge
  }

  private async saveBridge(trx: TransactionClientContract, bridge: RegisteredBridge) {
    await trx
      .from('saganexus_shared_cache')
      .where('key', `registered-bridge:${bridge.id}`)
      .update({
        payload: encryption.encrypt(bridge),
        expires_at: new Date(bridge.expiresAt),
        updated_at: new Date(),
      })
  }

  async activateBridge(
    id: string,
    authorizationToken: string,
    proposedBridgeToken: string,
    proof?: string
  ) {
    return db.transaction(async (trx) => {
      const bridge = await this.loadBridge(trx, id)
      if (bridge.publicKey) {
        if (!proof || !activationProofMatches(bridge, proposedBridgeToken, proof)) {
          return fail(403, 'E_BRIDGE_ACTIVATION_INVALID')
        }
        if (bridge.state === 'active') {
          if (!tokenMatches(proposedBridgeToken, bridge.tokenHash))
            return fail(403, 'E_BRIDGE_ACTIVATION_INVALID')
          return { bridgeId: bridge.id, expiresAt: bridge.expiresAt }
        }
        if (bridge.state !== 'pending') return fail(403, 'E_BRIDGE_ACTIVATION_INVALID')
      } else {
        if (!/^[A-Za-z0-9_-]{43}$/.test(proposedBridgeToken))
          return fail(403, 'E_BRIDGE_ACTIVATION_INVALID')
        if (bridge.state === 'active') {
          if (
            !tokenMatches(authorizationToken, bridge.tokenHash) ||
            !tokenMatches(proposedBridgeToken, bridge.tokenHash)
          ) return fail(403, 'E_BRIDGE_ACTIVATION_INVALID')
          return { bridgeId: bridge.id, expiresAt: bridge.expiresAt }
        }
        if (bridge.state !== 'pending' || !tokenMatches(authorizationToken, bridge.tokenHash)) {
          return fail(403, 'E_BRIDGE_ACTIVATION_INVALID')
        }
      }
      bridge.state = 'active'
      bridge.tokenHash = hash(proposedBridgeToken)
      bridge.expiresAt = Date.now() + BRIDGE_TTL_MS
      await this.saveBridge(trx, bridge)
      return { bridgeId: bridge.id, expiresAt: bridge.expiresAt }
    })
  }

  async revokeBridge(id: string, userId: number) {
    return db.transaction(async (trx) => {
      const bridge = await this.loadBridge(trx, id)
      if (bridge.ownerUserId !== userId) return fail(404, 'E_BRIDGE_IDENTITY_NOT_FOUND')
      bridge.state = 'revoked'
      bridge.tokenHash = ''
      bridge.expiresAt = Date.now()
      await this.saveBridge(trx, bridge)
    })
  }

  async create(gatewayMacs: string[], identity: { bridgeId: string; token: string }) {
    return db.transaction(async (trx) => {
      const bridge = await this.loadBridge(trx, identity.bridgeId)
      if (bridge.state !== 'active' || !tokenMatches(identity.token, bridge.tokenHash))
        return fail(403, 'E_BRIDGE_IDENTITY_INVALID')
      const credentials = createBridgePairingCredentials()
      const session: Session = {
        ...credentials.session,
        registeredBridgeId: bridge.id,
        ownerUserId: bridge.ownerUserId,
        gatewayMacs: [...new Set(gatewayMacs.map((mac) => mac.toLowerCase()))],
        status: 'waiting',
      }
      await trx.table('saganexus_shared_cache').insert({
        key: `bridge-pairing:${session.id}`,
        payload: encryption.encrypt(session),
        expires_at: new Date(session.expiresAt),
        updated_at: new Date(),
      })
      // Automatic renewal while the bridge is active; no periodic manual PC setup.
      bridge.expiresAt = Date.now() + BRIDGE_TTL_MS
      await this.saveBridge(trx, bridge)
      return {
        sessionId: session.id,
        expiresAt: session.expiresAt,
        bridgeToken: credentials.bridgeToken,
      }
    })
  }

  private async withSession<T>(
    id: string,
    action: (session: Session, trx: TransactionClientContract) => Promise<T>
  ) {
    return db.transaction(async (trx) => {
      const key = `bridge-pairing:${id}`
      const row = await trx.from('saganexus_shared_cache').where('key', key).forUpdate().first()
      const session = row ? encryption.decrypt<Session>(row.payload) : null
      if (!session || !Number.isFinite(session.expiresAt) || Date.now() >= session.expiresAt)
        return fail(404, 'E_BRIDGE_SESSION_EXPIRED')
      const bridge = await this.loadBridge(trx, session.registeredBridgeId)
      if (bridge.state !== 'active' || bridge.ownerUserId !== session.ownerUserId)
        return fail(403, 'E_BRIDGE_IDENTITY_INVALID')
      const result = await action(session, trx)
      await trx
        .from('saganexus_shared_cache')
        .where('key', key)
        .update({ payload: encryption.encrypt(session), updated_at: new Date() })
      return result
    })
  }

  async authorize(
    id: string,
    userId: number,
    input: { gatewayId: number; gatewayMac: string; enrollmentCode: string },
    isAdmin = false
  ) {
    return this.withSession(id, async (session, trx) => {
      if (!isAdmin && session.ownerUserId !== userId) return fail(404, 'E_BRIDGE_SESSION_NOT_FOUND')
      if (session.status !== 'waiting') return fail(409, 'E_BRIDGE_SESSION_STATE')
      const mac = input.gatewayMac.toLowerCase()
      if (!session.gatewayMacs.includes(mac)) return fail(403, 'E_BRIDGE_GATEWAY_INVALID')
      await lockGatewayForPairing(trx, input.gatewayId)
      const enrollment = await trx
        .from('gateway_enrollments')
        .where('gateway_id', input.gatewayId)
        .where('token_hash', hash(input.enrollmentCode))
        .whereNull('claimed_at')
        .where('expires_at', '>', new Date())
        .first()
      if (!enrollment) {
        logger.warn({ gatewayId: input.gatewayId, sessionId: id }, 'Bridge enrollment lookup failed')
        return fail(403, 'E_BRIDGE_ENROLLMENT_INVALID')
      }
      await saveGatewayPairing(trx, input.gatewayId, `bridge:${id}:approved`, new Date(session.expiresAt))
      session.status = 'approved'
      session.approvedBy = userId
      session.gatewayId = input.gatewayId
      session.gatewayMac = mac
      session.enrollmentCode = input.enrollmentCode
      return { status: 'approved' as const }
    })
  }

  async poll(id: string, token: string) {
    return this.withSession(id, async (session) => {
      if (!verifyBridgePairingToken(session, token)) return fail(403, 'E_BRIDGE_TOKEN_INVALID')
      if (session.status === 'approved')
        return {
          status: session.status,
          gatewayMac: session.gatewayMac,
          enrollmentCode: session.enrollmentCode,
        }
      return { status: session.status }
    })
  }

  async acknowledge(id: string, token: string, outcome: 'submitted' | 'failed') {
    return this.withSession(id, async (session, trx) => {
      if (!verifyBridgePairingToken(session, token)) return fail(403, 'E_BRIDGE_TOKEN_INVALID')
      if (session.status !== 'approved' && session.status !== outcome)
        return fail(409, 'E_BRIDGE_SESSION_STATE')
      if (outcome === 'failed' && session.gatewayId !== undefined) {
        await trx
          .from('saganexus_shared_cache')
          .where('key', gatewayPairingKey(session.gatewayId))
          .whereLike('payload', `bridge:${id}:%`)
          .update({ expires_at: new Date() })
      }
      session.status = outcome
      delete session.enrollmentCode
      return { status: session.status }
    })
  }

  async status(id: string, userId: number, isAdmin = false) {
    return this.withSession(id, async (session) => {
      if (!isAdmin && session.ownerUserId !== userId) return fail(404, 'E_BRIDGE_SESSION_NOT_FOUND')
      return {
        status: session.status,
        ...(session.gatewayId ? { gatewayId: session.gatewayId } : {}),
      }
    })
  }
}
