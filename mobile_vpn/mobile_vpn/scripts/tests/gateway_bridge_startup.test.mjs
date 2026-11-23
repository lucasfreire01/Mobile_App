import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { test } from 'node:test'
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import http from 'node:http'
import https from 'node:https'
import net from 'node:net'
import os from 'node:os'
import { syncBuiltinESMExports } from 'node:module'

test('actual bridge overlaps discovery and account-bound activation before serving without publishing secrets', { timeout: 5000 }, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'saganexus-startup-test-'))
  const config = join(directory, 'bridge.json')
  const oldArgv = process.argv
  const oldConfig = process.env.SAGANEXUS_BRIDGE_CONFIG
  const bridgeId = '12345678-1234-1234-1234-123456789abc'
  const sessionId = '87654321-1234-1234-1234-123456789abc'
  await writeFile(config, JSON.stringify({ apiUrl: 'https://backend.example', bridgeId, installationToken: 'G'.repeat(43) }))
  process.argv = ['node', 'fixture', '192.0.2.1', '198.51.100.1']
  process.env.SAGANEXUS_BRIDGE_CONFIG = config
  t.after(async () => {
    process.argv = oldArgv
    if (oldConfig === undefined) delete process.env.SAGANEXUS_BRIDGE_CONFIG
    else process.env.SAGANEXUS_BRIDGE_CONFIG = oldConfig
    t.mock.restoreAll()
    syncBuiltinESMExports()
    await rm(directory, { recursive: true, force: true })
  })
  let handler
  let startupDiscovery
  let requests = 0
  const logs = []
  let preparationStarted
  const preparationReady = new Promise((resolve) => { preparationStarted = resolve })
  let deviceProbeStarted
  const probeStarted = new Promise((resolve) => { deviceProbeStarted = resolve })
  let gatewayProbeCompleted = false
  t.mock.method(os, 'networkInterfaces', () => ({}))
  t.mock.method(globalThis, 'setInterval', () => 0)
  t.mock.method(console, 'log', (message) => logs.push(message))
  t.mock.method(http, 'createServer', (callback) => {
    handler = callback
    return { listen() {
      handler({ method: 'GET', url: '/saganexus-discovery', socket: { remoteAddress: '192.0.2.2' } }, {
        setHeader() {}, end(body) { startupDiscovery = JSON.parse(body) },
      })
    } }
  })
  t.mock.method(https, 'get', (options, callback) => {
    const request = new EventEmitter()
    queueMicrotask(async () => {
      if (options.hostname !== '198.51.100.126') { request.emit('error', new Error('No device')); return }
      deviceProbeStarted()
      await preparationReady
      const response = new EventEmitter()
      response.statusCode = 200
      callback(response)
      response.emit('data', JSON.stringify({ model: 'Browan', mac: '00:16:16:2b:c7:26' }))
      gatewayProbeCompleted = true
      response.emit('end')
    })
    return request
  })
  t.mock.method(net, 'createServer', () => {
    const server = new EventEmitter()
    server.listen = (_port, _host, callback) => queueMicrotask(callback)
    server.close = () => {}
    return server
  })
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    requests++
    const stored = JSON.parse(await readFile(config, 'utf8'))
    assert.equal(options.redirect, 'error')
    if (url.endsWith('/activate')) {
      assert.equal(JSON.parse(options.body).bridgeToken, stored.bridgeToken)
      await probeStarted
      assert.equal(handler, undefined, 'Discovery must wait for the completed scan and activation')
      preparationStarted()
      return Response.json({ bridgeId, expiresAt: Date.now() + 60_000 }, { status: 201 })
    }
    assert.equal(gatewayProbeCompleted, true, 'Relay sessions must wait for the completed gateway scan')
    assert.equal(options.headers.Authorization, `Bearer ${stored.bridgeToken}`)
    assert.equal(JSON.parse(options.body).bridgeId, bridgeId)
    return Response.json({ sessionId, expiresAt: Date.now() + 60_000, bridgeToken: 'S'.repeat(43) })
  })
  syncBuiltinESMExports()
  await import('../gateway_lan_bridge.ts')
  let discovery
  handler({ method: 'GET', url: '/saganexus-discovery', socket: { remoteAddress: '192.0.2.2' } }, {
    setHeader() {}, end(body) { discovery = JSON.parse(body) },
  })
  assert.equal(requests, 2)
  assert.equal(startupDiscovery.pairing.sessionId, sessionId, 'First request must include the activated session')
  assert.equal(discovery.pairing.sessionId, sessionId)
  assert.equal(Object.hasOwn(discovery.pairing, 'bridgeToken'), false)
  assert.equal(Object.hasOwn(discovery.pairing, 'confirmationCode'), false)
  const stored = JSON.parse(await readFile(config, 'utf8'))
  assert.equal(Object.hasOwn(stored, 'installationToken'), false)
  assert.equal(logs.some((message) => message.includes(stored.bridgeToken)), false)
})

test('failed startup and retry preserve discovery until a later retry authenticates the bridge', { timeout: 5000 }, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'saganexus-startup-retry-test-'))
  const config = join(directory, 'bridge.json')
  const oldArgv = process.argv
  const oldConfig = process.env.SAGANEXUS_BRIDGE_CONFIG
  const oldSigintListeners = new Set(process.listeners('SIGINT'))
  const bridgeId = '12345678-1234-1234-1234-123456789abc'
  const sessionId = '87654321-1234-1234-1234-123456789abc'
  await writeFile(config, JSON.stringify({ apiUrl: 'https://backend.example', bridgeId, installationToken: 'G'.repeat(43) }))
  process.argv = ['node', 'fixture', '192.0.2.1', '198.51.100.1']
  process.env.SAGANEXUS_BRIDGE_CONFIG = config
  t.after(async () => {
    process.argv = oldArgv
    if (oldConfig === undefined) delete process.env.SAGANEXUS_BRIDGE_CONFIG
    else process.env.SAGANEXUS_BRIDGE_CONFIG = oldConfig
    for (const listener of process.listeners('SIGINT')) {
      if (!oldSigintListeners.has(listener)) process.removeListener('SIGINT', listener)
    }
    t.mock.restoreAll()
    syncBuiltinESMExports()
    await rm(directory, { recursive: true, force: true })
  })
  let handler
  let startupDiscovery
  let activationAttempts = 0
  let sessionRequests = 0
  let activationFails = true
  let attemptObserved
  const intervals = new Map()
  const logs = []
  function discover(overrides = {}) {
    let body
    let status = 200
    const headers = {}
    handler({ method: 'GET', url: '/saganexus-discovery', socket: { remoteAddress: '192.0.2.2' }, ...overrides }, {
      setHeader(name, value) { headers[name] = value },
      writeHead(value) { status = value; return this },
      end(value) { if (value) body = JSON.parse(value) },
    })
    return { body, status, headers }
  }
  async function retry() {
    const observed = new Promise((resolve) => { attemptObserved = resolve })
    intervals.get(4000)()
    await observed
    await new Promise((resolve) => setImmediate(resolve))
    attemptObserved = undefined
  }
  t.mock.method(os, 'networkInterfaces', () => ({}))
  t.mock.method(globalThis, 'setInterval', (callback, milliseconds) => {
    intervals.set(milliseconds, callback)
    return 0
  })
  t.mock.method(console, 'log', (message) => logs.push(message))
  t.mock.method(http, 'createServer', (callback) => {
    handler = callback
    return { listen() { startupDiscovery = discover().body } }
  })
  t.mock.method(https, 'get', (options, callback) => {
    const request = new EventEmitter()
    queueMicrotask(() => {
      if (options.hostname !== '198.51.100.126') { request.emit('error', new Error('No device')); return }
      const response = new EventEmitter()
      response.statusCode = 200
      callback(response)
      response.emit('data', JSON.stringify({ model: 'Browan', mac: '00:16:16:2b:c7:26' }))
      response.emit('end')
    })
    return request
  })
  t.mock.method(net, 'createServer', () => {
    const server = new EventEmitter()
    server.listen = (_port, _host, callback) => queueMicrotask(callback)
    server.close = () => {}
    return server
  })
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    const stored = JSON.parse(await readFile(config, 'utf8'))
    assert.equal(options.redirect, 'error')
    if (url.endsWith('/activate')) {
      activationAttempts++
      assert.equal(JSON.parse(options.body).bridgeToken, stored.bridgeToken)
      if (activationFails) {
        attemptObserved?.()
        throw new Error('Temporary activation failure')
      }
      return Response.json({ bridgeId, expiresAt: Date.now() + 60_000 }, { status: 201 })
    }
    sessionRequests++
    assert.equal(options.headers.Authorization, `Bearer ${stored.bridgeToken}`)
    assert.equal(JSON.parse(options.body).bridgeId, bridgeId)
    attemptObserved?.()
    return Response.json({ sessionId, expiresAt: Date.now() + 60_000, bridgeToken: 'S'.repeat(43) })
  })
  syncBuiltinESMExports()
  await import('../gateway_lan_bridge.ts?startup-retry-regression')
  assert.equal(activationAttempts, 1)
  assert.equal(sessionRequests, 0)
  assert.equal(startupDiscovery.gateways.length, 1, 'Preparation failure must preserve completed gateway discovery')
  assert.equal(Object.hasOwn(startupDiscovery, 'pairing'), false)
  const failedConfig = JSON.parse(await readFile(config, 'utf8'))
  assert.equal(Object.hasOwn(failedConfig, 'installationToken'), true)
  assert.equal(discover().headers['Cache-Control'], 'no-store')
  for (const overrides of [{ method: 'POST' }, { url: '/other' }, { socket: { remoteAddress: '203.0.113.5' } }]) {
    const rejected = discover(overrides)
    assert.equal(rejected.status, 404)
    assert.equal(rejected.body, undefined)
  }
  await retry()
  assert.equal(activationAttempts, 2, 'The real periodic callback must retry failed preparation')
  assert.equal(sessionRequests, 0)
  assert.equal(discover().body.gateways.length, 1)
  assert.equal(Object.hasOwn(discover().body, 'pairing'), false)
  activationFails = false
  await retry()
  assert.equal(activationAttempts, 3, 'A failed retry must release the guard for the next attempt')
  assert.equal(sessionRequests, 1)
  const discovery = discover().body
  assert.equal(discovery.pairing.sessionId, sessionId)
  assert.equal(Object.hasOwn(discovery.pairing, 'bridgeToken'), false)
  assert.equal(Object.hasOwn(discovery.pairing, 'confirmationCode'), false)
  const stored = JSON.parse(await readFile(config, 'utf8'))
  assert.equal(stored.bridgeToken, failedConfig.bridgeToken, 'Retries must preserve the durable bridge identity')
  assert.equal(Object.hasOwn(stored, 'installationToken'), false)
  for (const secret of [stored.bridgeToken, 'G'.repeat(43), 'S'.repeat(43)]) {
    assert.equal(JSON.stringify(startupDiscovery).includes(secret), false)
    assert.equal(JSON.stringify(discovery).includes(secret), false)
    assert.equal(logs.some((message) => message.includes(secret)), false)
  }
})
