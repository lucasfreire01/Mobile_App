import { test } from '@japa/runner'
import { setImmediate } from 'node:timers/promises'
import { DateTime } from 'luxon'
import Gateway from '#models/gateway'
import GatewayStatusJob from '#jobs/gateway_status_job'
import db from '@adonisjs/lucid/services/db'

test.group('Bounded gateway status monitoring', (group) => {
  let sequence = 1
  group.each.setup(async () => {
    await Gateway.query().delete()
    await db.from('gateway_monitor_states').delete()
    sequence = 1
  })
  async function gateway() {
    return Gateway.create({
      name: `monitor-${sequence}`,
      managementIpAddress: `10.42.0.${sequence++}`,
      status: 'offline',
      wanIpAddress: '192.0.2.1',
    })
  }
  const waitForAbort = (signal: AbortSignal) =>
    new Promise<never>((_resolve, reject) => {
      if (signal.aborted) {
        reject(new Error('cancelled'))
        return
      }
      signal.addEventListener('abort', () => reject(new Error('cancelled')), { once: true })
    })

  test('processes multiple batches with at most the configured concurrent probes', async ({
    assert,
  }) => {
    for (let i = 0; i < 7; i++) await gateway()
    let active = 0
    let maximum = 0
    const seen: number[] = []
    let releaseFirstPair!: () => void
    const firstPair = new Promise<void>((resolve) => {
      releaseFirstPair = resolve
    })
    const job = new GatewayStatusJob({
      concurrency: 2,
      batchSize: 3,
      probe: async (entry) => {
        active++
        maximum = Math.max(maximum, active)
        seen.push(entry.id)
        if (seen.length === 2) releaseFirstPair()
        await firstPair
        await setImmediate()
        active--
        return { wanIpAddress: '192.0.2.2' }
      },
    })
    const result = await job.run()
    assert.equal(result.checked, 7)
    assert.equal(maximum, 2)
    assert.equal(new Set(seen).size, 7)
    const rows = await Gateway.all()
    assert.isTrue(
      rows.every(
        (row) =>
          row.status === 'online' && row.lastSeenAt !== null && row.wanIpAddress === '192.0.2.2'
      )
    )
    const repeated = await job.run()
    assert.equal(repeated.checked, 7)
  })

  test('isolates failures and preserves previous observations when WAN is unavailable', async ({
    assert,
  }) => {
    const failed = await gateway()
    failed.lastSeenAt = DateTime.now().minus({ hours: 1 })
    await failed.save()
    const healthy = await gateway()
    await Gateway.create({ name: 'no-address' })
    const job = new GatewayStatusJob({
      probe: async (entry) => {
        if (entry.id === failed.id) throw new Error('unreachable')
        return { wanIpAddress: null }
      },
    })
    const result = await job.run()
    assert.equal(result.checked, 2)
    assert.equal(result.offline, 1)
    const previousSeen = failed.lastSeenAt.toMillis()
    await failed.refresh()
    await healthy.refresh()
    assert.equal(failed.lastSeenAt!.toMillis(), previousSeen)
    assert.equal(healthy.status, 'online')
    assert.equal(healthy.wanIpAddress, '192.0.2.1')
  })

  test('cancels timed-out probes before taking the next slot', async ({ assert }) => {
    for (let i = 0; i < 3; i++) await gateway()
    let active = 0
    let maximum = 0
    let aborted = 0
    const job = new GatewayStatusJob({
      concurrency: 1,
      probeTimeoutMs: 20,
      cycleTimeoutMs: 1000,
      probe: async (_entry, signal) => {
        active++
        maximum = Math.max(maximum, active)
        try {
          return await waitForAbort(signal)
        } finally {
          active--
          aborted++
        }
      },
    })
    const result = await job.run()
    assert.equal(result.offline, 3)
    assert.equal(aborted, 3)
    assert.equal(active, 0)
    assert.equal(maximum, 1)
    assert.isFalse(result.budgetExhausted)
  })

  test('skips an overlapping invocation of the same cycle', async ({ assert }) => {
    await gateway()
    let started!: () => void
    let release!: () => void
    const entered = new Promise<void>((resolve) => {
      started = resolve
    })
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const job = new GatewayStatusJob({
      probe: async () => {
        started()
        await gate
        return { wanIpAddress: null }
      },
    })
    const first = job.run()
    try {
      await entered
      const skipped = await job.run()
      assert.isTrue(skipped.skipped)
    } finally {
      release()
    }
    const result = await first
    assert.equal(result.checked, 1)
  })

  test('stops dispatching at the cycle deadline and resumes after its cursor next time', async ({
    assert,
  }) => {
    const first = await gateway()
    await gateway()
    await gateway()
    first.status = 'online'
    await first.save()
    const seen: number[] = []
    const job = new GatewayStatusJob({
      concurrency: 1,
      probeTimeoutMs: 500,
      cycleTimeoutMs: 100,
      probe: async (entry, signal) => {
        seen.push(entry.id)
        return waitForAbort(signal)
      },
    })
    const expired = await job.run()
    assert.isTrue(expired.budgetExhausted)
    assert.equal(expired.checked, 0)
    await first.refresh()
    assert.equal(first.status, 'online')
    const resumed = await new GatewayStatusJob({
      probe: async (entry) => {
        seen.push(entry.id)
        return { wanIpAddress: null }
      },
    }).run()
    assert.equal(resumed.checked, 2)
    assert.equal(new Set(seen).size, 3)
  })

  test('discards an observation when the management IP changes during its probe', async ({
    assert,
  }) => {
    const entry = await gateway()
    const job = new GatewayStatusJob({
      probe: async () => {
        await Gateway.query().where('id', entry.id).update({ managementIpAddress: '10.42.0.200' })
        return { wanIpAddress: '192.0.2.9' }
      },
    })
    await job.run()
    await entry.refresh()
    assert.equal(entry.managementIpAddress, '10.42.0.200')
    assert.equal(entry.status, 'offline')
    assert.equal(entry.wanIpAddress, '192.0.2.1')
  })

  test('rejects unsafe configuration values', ({ assert }) => {
    for (const concurrency of [0, -1, 1.5, 21])
      assert.throws(() => new GatewayStatusJob({ concurrency }), /monitoring limit/)
    assert.throws(() => new GatewayStatusJob({ batchSize: 501 }), /monitoring limit/)
    assert.throws(() => new GatewayStatusJob({ cycleTimeoutMs: 120000 }), /monitoring limit/)
  })
})
