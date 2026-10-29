import db from '@adonisjs/lucid/services/db'

export function assertIsolatedTestTarget(settings: {
  nodeEnv?: string
  runId?: string
  database?: string
  user?: string
  connection?: string
}) {
  const { nodeEnv, runId, database, user, connection } = settings
  if (
    nodeEnv !== 'test' ||
    !runId ||
    !/^[a-f0-9]{24}$/.test(runId) ||
    connection !== 'pg' ||
    database !== `saganexus_test_${runId}` ||
    user !== `${database}_owner`
  ) {
    throw new Error('Unsafe test database target. Run npm test to create an isolated database.')
  }
}

export async function verifyIsolatedTestDatabase() {
  assertIsolatedTestTarget({
    nodeEnv: process.env.NODE_ENV,
    runId: process.env.SAGANEXUS_TEST_RUN_ID,
    database: process.env.DB_DATABASE,
    user: process.env.DB_USER,
    connection: process.env.DB_CONNECTION,
  })
  const {
    rows: [actual],
  } = await db.rawQuery(`SELECT current_database() AS database,
    current_user AS role, r.rolsuper, r.rolcreatedb, r.rolcreaterole, r.rolbypassrls,
    pg_get_userbyid(d.datdba) AS owner
    FROM pg_roles r, pg_database d WHERE r.rolname = current_user AND d.datname = current_database()`)
  if (
    actual.database !== process.env.DB_DATABASE ||
    actual.role !== process.env.DB_USER ||
    actual.owner !== actual.role ||
    actual.rolsuper ||
    actual.rolcreatedb ||
    actual.rolcreaterole ||
    actual.rolbypassrls
  ) {
    throw new Error('Test database identity or role privileges do not match the isolated target.')
  }
}
