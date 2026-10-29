import { test } from '@japa/runner'
import { assertIsolatedTestTarget } from '../support/test_database_guard.js'

test.group('Isolated test database guard', () => {
  const runId = '1234567890abcdef12345678'
  const valid = {
    nodeEnv: 'test',
    runId,
    connection: 'pg',
    database: `saganexus_test_${runId}`,
    user: `saganexus_test_${runId}_owner`,
  }
  test('accepts the uniquely named temporary database and its dedicated role', ({ assert }) => {
    assert.doesNotThrow(() => assertIsolatedTestTarget(valid))
  })
  test('rejects operational, legacy and mismatched targets before migrations', ({ assert }) => {
    for (const settings of [
      { ...valid, database: 'browan_config' },
      { ...valid, database: 'browan_config_test' },
      { ...valid, user: 'saganexus_runtime' },
      { ...valid, runId: undefined },
      { ...valid, nodeEnv: 'production' },
      { ...valid, connection: 'sqlite' },
    ])
      assert.throws(() => assertIsolatedTestTarget(settings), /Unsafe test database/)
  })
})
