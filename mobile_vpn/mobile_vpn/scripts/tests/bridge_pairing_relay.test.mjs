import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, readFile, writeFile, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { BridgePairingRelay, trustedGatewayKeys, prepareBridgeInstallation } from '../bridge_pairing_relay.ts'

const device = { ip: '10.43.0.126', mac: '00:16:16:2b:c7:26' }
const enrollmentCode = 'T'.repeat(43)
const bridgeToken = 'B'.repeat(43)
const sessionId = '12345678-1234-1234-1234-123456789abc'

function fixture({ missing = false, failSubmit = false, failReceipt = false } = {}) {
  const calls = []
  const submitted = []
  const events = []
  let receipts = 0
  const relay = new BridgePairingRelay('https://backend.example/api/v1', {
    identity: { bridgeId: sessionId, token: 'P'.repeat(43) },
    onEvent: (event) => events.push(event),
    submit: async (target, code) => {
      submitted.push({ target, code })
      if (failSubmit) throw new Error('Host identity unknown')
    },
    fetch: async (url, options) => {
      calls.push({ url, options })
      assert.equal(options.redirect, 'error')
      if (url.endsWith('/gateway-bridge-sessions')) {
        assert.equal(options.headers.Authorization, `Bearer ${'P'.repeat(43)}`)
        assert.equal(JSON.parse(options.body).bridgeId, sessionId)
        return Response.json({ sessionId, expiresAt: Date.now() + 60_000, bridgeToken })
      }
      assert.equal(options.headers.Authorization, `Bearer ${bridgeToken}`)
      if (url.endsWith('/poll')) return Response.json({ status: 'approved', gatewayMac: missing ? '00:11:22:33:44:55' : device.mac, enrollmentCode })
      receipts++
      if (failReceipt && receipts === 1) throw new Error('Connection lost')
      return Response.json({ status: JSON.parse(options.body).outcome })
    },
  })
  return { relay, calls, submitted, events }
}

test('requires HTTPS and refuses credentials, query strings, and arbitrary API paths', () => {
  for (const url of ['http://backend.example', 'https://user:password@backend.example', 'https://backend.example/?token=x', 'https://backend.example/other']) {
    assert.throws(() => new BridgePairingRelay(url, { onConfirmation() {}, onEvent() {} }))
  }
})

test('discovery exposes only public session metadata and delivers to the selected device', async () => {
  const f = fixture()
  await f.relay.tick([device])
  assert.deepEqual(Object.keys(f.relay.publicSession()).sort(), ['expiresAt', 'sessionId'])
  assert.equal(JSON.stringify(f.relay.publicSession()).includes(bridgeToken), false)
  await f.relay.tick([device])
  assert.deepEqual(f.submitted, [{ target: device, code: enrollmentCode }])
  assert.deepEqual(f.events, ['submitted'])
  assert.equal(f.calls.at(-1).options.body, JSON.stringify({ outcome: 'submitted' }))
})

test('retries a lost receipt without submitting the code to the device again', async () => {
  const f = fixture({ failReceipt: true })
  await f.relay.tick([device])
  await f.relay.tick([device])
  await f.relay.tick([device])
  assert.equal(f.submitted.length, 1)
  assert.equal(f.calls.filter((call) => call.url.endsWith('/result')).length, 2)
})

test('missing device or failed SSH identity reports failure instead of claiming success', async () => {
  for (const config of [{ missing: true }, { failSubmit: true }]) {
    const f = fixture(config)
    await f.relay.tick([device])
    await f.relay.tick([device])
    assert.deepEqual(f.events, ['failed'])
    const receipt = f.calls.find((call) => call.url.endsWith('/result'))
    assert.equal(receipt.options.body, JSON.stringify({ outcome: 'failed' }))
    assert.ok(f.relay.publicSession(), 'Failure must renew before the tick returns')
    assert.equal(f.calls.filter((call) => call.url.endsWith('/gateway-bridge-sessions')).length, 2)
  }
})

test('matches trusted public keys across changed IPs, respects revocation and skips CA entries', () => {
  const scanned = '10.43.0.126 ssh-ed25519 AAAA\n10.43.0.126 ssh-rsa BBBB\n'
  assert.deepEqual(trustedGatewayKeys(scanned, '|1|hashed-host ssh-ed25519 AAAA'), ['ssh-ed25519 AAAA'])
  assert.deepEqual(trustedGatewayKeys(scanned, 'old ssh-ed25519 AAAA\n@revoked old ssh-ed25519 AAAA'), [])
  assert.deepEqual(trustedGatewayKeys(scanned, '@cert-authority old ssh-rsa BBBB'), [])
  assert.deepEqual(trustedGatewayKeys(scanned, 'old ssh-ed25519 OTHER'), [])
})

test('real CGI reports JSON acceptance and explicit errors without echoing the code', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'saganexus-cgi-test-'))
  try {
    await mkdir(join(directory, 'etc/saganexus'), { recursive: true })
    await writeFile(join(directory, 'etc/saganexus/bootstrap.conf'), "API_URL='https://backend.example'\nCA_BUNDLE='/unused'\n")
    const source = await readFile(new URL('../browan_package/enroll.cgi', import.meta.url), 'utf8')
    const script = source.replaceAll('/etc/saganexus/', `${directory}/etc/saganexus/`).replace('/usr/sbin/saganexus-enrollment-agent', '/bin/true')
    const path = join(directory, 'enroll.cgi')
    await writeFile(path, script)
    const env = { ...process.env, REQUEST_METHOD: 'POST', HTTPS: 'on', HTTP_HOST: 'localhost', HTTP_ACCEPT: 'application/json', CONTENT_LENGTH: '48', QUERY_STRING: '', HTTP_ORIGIN: '' }
    const accepted = spawnSync('sh', [path], { env, input: `code=${enrollmentCode}`, encoding: 'utf8' })
    assert.equal(accepted.status, 0)
    assert.match(accepted.stdout, /"accepted":true/)
    assert.equal(accepted.stdout.includes(enrollmentCode), false)
    const duplicate = spawnSync('sh', [path], { env, input: `code=${enrollmentCode}`, encoding: 'utf8' })
    assert.match(duplicate.stdout, /Status: 400/)
    assert.match(duplicate.stdout, /"accepted":false/)
    const insecure = spawnSync('sh', [path], { env: { ...env, HTTPS: '', SERVER_PORT: '80' }, input: `code=${enrollmentCode}`, encoding: 'utf8' })
    assert.match(insecure.stdout, /HTTPS is required/)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})


test('installation persists its PC credential before network activation and removes the one-time grant', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'saganexus-activation-test-'))
  const path = join(directory, 'bridge.json')
  try {
    const grant = 'G'.repeat(43)
    await writeFile(path, JSON.stringify({ apiUrl: 'https://backend.example', bridgeId: sessionId, installationToken: grant }))
    const result = await prepareBridgeInstallation(path, async (url, options) => {
      const stored = JSON.parse(await readFile(path, 'utf8'))
      assert.match(stored.bridgeToken, /^[A-Za-z0-9_-]{43}$/)
      assert.equal(JSON.parse(options.body).bridgeToken, stored.bridgeToken)
      assert.equal(options.headers.Authorization, `Bearer ${grant}`)
      assert.equal(options.redirect, 'error')
      assert.equal(url.includes(grant), false)
      return Response.json({ bridgeId: sessionId, expiresAt: Date.now() + 60_000 }, { status: 201 })
    })
    const stored = JSON.parse(await readFile(path, 'utf8'))
    assert.equal(result.identity.token, stored.bridgeToken)
    assert.equal(Object.hasOwn(stored, 'installationToken'), false)
  } finally { await rm(directory, { recursive: true, force: true }) }
})

test('lost activation response recovers with the same durable credential without using the grant twice', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'saganexus-activation-test-'))
  const path = join(directory, 'bridge.json')
  try {
    await writeFile(path, JSON.stringify({ apiUrl: 'https://backend.example', bridgeId: sessionId, installationToken: 'G'.repeat(43) }))
    let retainedToken
    await assert.rejects(() => prepareBridgeInstallation(path, async (_url, options) => {
      retainedToken = JSON.parse(options.body).bridgeToken
      throw new Error('Response lost after server activation')
    }))
    const result = await prepareBridgeInstallation(path, async (_url, options) => {
      assert.equal(options.headers.Authorization, `Bearer ${retainedToken}`)
      assert.equal(JSON.parse(options.body).bridgeToken, retainedToken)
      return Response.json({ bridgeId: sessionId, expiresAt: Date.now() + 60_000 }, { status: 201 })
    })
    assert.equal(result.identity.token, retainedToken)
  } finally { await rm(directory, { recursive: true, force: true }) }
})

test('a bridge without installation identity publishes no session and never contacts the backend', async () => {
  const events = []
  const relay = new BridgePairingRelay('https://backend.example', {
    onEvent: (event) => events.push(event),
    fetch: async () => { assert.fail('No request allowed without installation credentials') },
  })
  await relay.tick([device])
  assert.equal(relay.publicSession(), undefined)
  assert.deepEqual(events, ['unavailable'])
})
