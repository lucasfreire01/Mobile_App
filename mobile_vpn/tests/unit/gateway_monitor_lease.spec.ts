import { test } from '@japa/runner'
import { setImmediate } from 'node:timers/promises'
import db from '@adonisjs/lucid/services/db'
import Gateway from '#models/gateway'
import GatewayStatusJob from '#jobs/gateway_status_job'
import GatewayMonitorLeaseService, {
  GATEWAY_MONITOR_NAME,
} from '#services/gateway_monitor_lease_service'
import GatewayLockService from '#services/gateway_lock_service'

test.group('Distributed gateway monitor ownership', (group) => {
  group.each.setup(async () => {
    await db.from('gateway_monitor_states').delete()
    await Gateway.query().delete()
  })

  const service = () => new GatewayMonitorLeaseService()
  const gateway = () =>
    Gateway.create({
      name: 'shared-monitor',
      managementIpAddress: '10.42.0.126',
      status: 'offline',
    })
  const expire = () =>
    db
      .from('gateway_monitor_states')
      .where('name', GATEWAY_MONITOR_NAME)
      .update({ lease_expires_at: db.raw("clock_timestamp() - interval '1 second'") })

  test('atomically grants only one of two simultaneous owners and retains its cursor on release', async ({
    assert,
  }) => {
    const first = service()
    const second = service()
    const leases = await Promise.all([first.acquire(5_000), second.acquire(5_000)])
    assert.equal(leases.filter(Boolean).length, 1)
    const owner = leases.find((lease) => lease !== null)!
    assert.isTrue(await first.advanceCursor(owner, 20))
    assert.isTrue(await first.advanceCursor(owner, 10))
    await first.release(owner)
    const next = await second.acquire(5_000)
    assert.isNotNull(next)
    assert.equal(next!.cursor, 20)
    await second.release(next!)
  })

  test('recovers an expired owner and fences its writes, cursor resets and late release', async ({
    assert,
  }) => {
    const entry = await gateway()
    const leases = service()
    const old = (await leases.acquire(5_000))!
    await leases.advanceCursor(old, entry.id)
    await expire()
    const current = (await leases.acquire(5_000))!
    assert.notEqual(current.token, old.token)
    assert.equal(current.cursor, entry.id)
    assert.isTrue(
      await leases.publish(current, entry, { status: 'online', wan_ip_address: '192.0.2.2' })
    )
    assert.isFalse(
      await leases.publish(old, entry, { status: 'offline', wan_ip_address: '192.0.2.1' })
    )
    assert.isFalse(await leases.advanceCursor(old, 99999))
    assert.isFalse(await leases.resetCursor(old))
    await leases.release(old)
    const state = await db.from('gateway_monitor_states').first()
    assert.equal(state.lease_token, current.token)
    await entry.refresh()
    assert.equal(entry.status, 'online')
    assert.equal(entry.wanIpAddress, '192.0.2.2')
    await leases.release(current)
  })

  test('checks expiration after waiting for a publication lock', async ({ assert }) => {
    const entry = await gateway()
    const leases = service()
    const owner = (await leases.acquire(5_000))!
    const transaction = await db.transaction()
    try {
      await transaction
        .from('gateway_monitor_states')
        .where('name', GATEWAY_MONITOR_NAME)
        .forUpdate()
        .first()
      await transaction
        .from('gateway_monitor_states')
        .where('name', GATEWAY_MONITOR_NAME)
        .update({ lease_expires_at: transaction.raw("clock_timestamp() - interval '1 second'") })
      const pending = leases.publish(owner, entry, { status: 'online' })
      await setImmediate()
      await transaction.commit()
      assert.isFalse(await pending)
      await entry.refresh()
      assert.equal(entry.status, 'offline')
    } finally {
      if (!transaction.isCompleted) await transaction.rollback()
    }
  })

  test('separate monitor instances skip a concurrent cycle without holding network-change locks during SSH', async ({
    assert,
  }) => {
    const entry = await gateway()
    let entered!: () => void
    let release!: () => void
    const started = new Promise<void>((resolve) => {
      entered = resolve
    })
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    let probes = 0
    const first = new GatewayStatusJob({
      probe: async () => {
        probes++
        entered()
        await gate
        return { wanIpAddress: null }
      },
    })
    const second = new GatewayStatusJob({
      probe: async () => {
        probes++
        return { wanIpAddress: null }
      },
    })
    const running = first.run()
    try {
      await started
      const skipped = await second.run()
      assert.isTrue(skipped.skipped)
      const networkLocks = new GatewayLockService()
      const networkLock = await networkLocks.acquire(entry.id)
      await networkLocks.release(entry.id, networkLock.token)
    } finally {
      release()
    }
    const result = await running
    assert.equal(result.checked, 1)
    assert.equal(probes, 1)
  })

  test('an in-flight result cannot overwrite a replacement owner observation', async ({
    assert,
  }) => {
    const entry = await gateway()
    let entered!: () => void
    let release!: () => void
    const started = new Promise<void>((resolve) => {
      entered = resolve
    })
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const job = new GatewayStatusJob({
      probe: async () => {
        entered()
        await gate
        return { wanIpAddress: '192.0.2.1' }
      },
    })
    const running = job.run()
    const leases = service()
    let replacement
    try {
      await started
      await expire()
      replacement = (await leases.acquire(5_000))!
      await leases.publish(replacement, entry, { status: 'online', wan_ip_address: '192.0.2.2' })
    } finally {
      release()
    }
    const result = await running
    assert.isTrue(result.leaseLost)
    assert.isFalse(result.budgetExhausted)
    assert.equal(result.writeErrors, 0)
    await entry.refresh()
    assert.equal(entry.wanIpAddress, '192.0.2.2')
    const state = await db.from('gateway_monitor_states').first()
    assert.equal(state.lease_token, replacement!.token)
    await leases.release(replacement!)
  })

  test('rejects invalid lease durations before touching database ownership', async ({ assert }) => {
    for (const duration of [0, -1, 1.5, 140_001]) {
      await assert.rejects(
        () => service().acquire(duration),
        /Invalid gateway monitor lease duration/
      )
    }
    assert.isEmpty(await db.from('gateway_monitor_states'))
  })

  test('cancels other in-flight probes before releasing ownership when dispatch fails', async ({
    assert,
  }) => {
    await gateway()
    const second = await Gateway.create({
      name: 'second',
      managementIpAddress: '10.42.0.127',
      status: 'offline',
    })
    let entered!: () => void
    const started = new Promise<void>((resolve) => {
      entered = resolve
    })
    let cancelled = false
    const original = GatewayMonitorLeaseService.prototype.advanceCursor
    GatewayMonitorLeaseService.prototype.advanceCursor = async function (lease, cursor) {
      if (cursor === second.id) {
        await started
        throw new Error('dispatch database failure')
      }
      return original.call(this, lease, cursor)
    }
    try {
      const job = new GatewayStatusJob({
        concurrency: 2,
        probe: async (_entry, signal) => {
          entered()
          return new Promise<never>((_resolve, reject) => {
            signal.addEventListener(
              'abort',
              () => {
                cancelled = true
                reject(new Error('cancelled'))
              },
              { once: true }
            )
          })
        },
      })
      await assert.rejects(() => job.run(), /dispatch database failure/)
      assert.isTrue(cancelled)
      const state = await db.from('gateway_monitor_states').first()
      assert.isNull(state.lease_token)
    } finally {
      GatewayMonitorLeaseService.prototype.advanceCursor = original
    }
  })
})
