import { test } from '@japa/runner'
import { EventEmitter } from 'node:events'
import type { Client, ClientChannel } from 'ssh2'
import Gateway from '#models/gateway'
import GatewaySshService from '#services/gateway_ssh_service'

class FakeClient extends EventEmitter {
  connects = 0
  destroyed = false
  ready = true
  output: string | null = '192.0.2.22\n'
  execError = false
  onExec = () => {}
  connect() {
    this.connects++
    if (this.ready) this.emit('ready')
    return this
  }
  destroy() {
    if (!this.destroyed) {
      this.destroyed = true
      this.emit('close')
    }
    return this
  }
  exec(_command: string, callback: (error: Error | undefined, stream: ClientChannel) => void) {
    const stream = new EventEmitter()
    callback(this.execError ? new Error('command failure') : undefined, stream as ClientChannel)
    this.onExec()
    if (this.output !== null)
      queueMicrotask(() => {
        stream.emit('data', Buffer.from(this.output!))
        stream.emit('close', 0)
      })
    return this
  }
}

function setup() {
  const client = new FakeClient()
  const service = new GatewaySshService(() => client as unknown as Client)
  service.readPrivateKey = () => Buffer.from('synthetic-test-key')
  const gateway = new Gateway()
  gateway.managementIpAddress = '10.42.0.126'
  gateway.sshHostKeyFingerprint = 'SHA256:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
  return { client, service, gateway }
}

test.group('Cancellable single-connection SSH status probe', () => {
  test('uses one connection and closes it after reading WAN', async ({ assert }) => {
    const { client, service, gateway } = setup()
    const result = await service.probeStatus(gateway, new AbortController().signal)
    assert.equal(result.wanIpAddress, '192.0.2.22')
    assert.equal(client.connects, 1)
    assert.isTrue(client.destroyed)
  })

  test('destroys an unfinished connection when its signal is aborted', async ({ assert }) => {
    const { client, service, gateway } = setup()
    client.ready = false
    const controller = new AbortController()
    const result = service.probeStatus(gateway, controller.signal)
    controller.abort()
    await assert.rejects(() => result, /monitoring cancelled/)
    assert.isTrue(client.destroyed)
  })

  test('cancels a stalled WAN command while retaining successful SSH liveness', async ({
    assert,
  }) => {
    const { client, service, gateway } = setup()
    client.output = null
    const controller = new AbortController()
    let entered!: () => void
    const started = new Promise<void>((resolve) => {
      entered = resolve
    })
    client.onExec = entered
    const pending = service.probeStatus(gateway, controller.signal)
    await started
    controller.abort()
    const result = await pending
    assert.isNull(result.wanIpAddress)
    assert.isTrue(client.destroyed)
  })

  test('ignores invalid or oversized WAN output and always closes the connection', async ({
    assert,
  }) => {
    for (const output of ['not-an-ip', 'x'.repeat(600)]) {
      const { client, service, gateway } = setup()
      client.output = output
      const result = await service.probeStatus(gateway, new AbortController().signal)
      assert.isNull(result.wanIpAddress)
      assert.isTrue(client.destroyed)
    }
  })

  test('keeps a reachable gateway online when its WAN command fails', async ({ assert }) => {
    const { client, service, gateway } = setup()
    client.execError = true
    const result = await service.probeStatus(gateway, new AbortController().signal)
    assert.isNull(result.wanIpAddress)
    assert.isTrue(client.destroyed)
  })
})
