import { test } from '@japa/runner'
import CloudConnexaMigrationRunner from '#services/cloud_connexa_migration_runner'

test.group('CloudConnexa migration runner', () => {
  test('shares one in-flight migration between concurrent callers', async ({ assert }) => {
    let calls = 0
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const result = { status: 'skipped' as const, migrated: 0 }
    const runner = new CloudConnexaMigrationRunner(
      async () => {
        calls += 1
        await gate
        return result
      },
      async (task) => task()
    )

    const first = runner.run()
    const second = runner.run()
    assert.strictEqual(first, second)
    release()

    assert.deepEqual(await Promise.all([first, second]), [result, result])
    assert.equal(calls, 1)
  })

  test('allows a later run after the previous one completes', async ({ assert }) => {
    let calls = 0
    const runner = new CloudConnexaMigrationRunner(
      async () => {
        calls += 1
        return { status: 'completed' as const, migrated: 1 }
      },
      async (task) => task()
    )

    await runner.run()
    await runner.run()

    assert.equal(calls, 2)
  })

  test('propagates a migration rejection and permits a retry', async ({ assert }) => {
    let calls = 0
    const runner = new CloudConnexaMigrationRunner(
      async () => {
        calls += 1
        if (calls === 1) throw new Error('temporary migration failure')
        return { status: 'skipped' as const, migrated: 0 }
      },
      async (task) => task()
    )

    await assert.rejects(() => runner.run(), 'temporary migration failure')
    assert.deepEqual(await runner.run(), { status: 'skipped', migrated: 0 })
    assert.equal(calls, 2)
  })
})
