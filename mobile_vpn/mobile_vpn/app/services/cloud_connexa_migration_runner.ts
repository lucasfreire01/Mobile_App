import db from '@adonisjs/lucid/services/db'
import CloudConnexaMigrationService, {
  type CloudConnexaMigrationResult,
} from '#services/cloud_connexa_migration_service'

const LOCK_KEY = 'saganexus:cloudconnexa-account-migration'

type MigrationTask = () => Promise<CloudConnexaMigrationResult>
type LockTask = (task: MigrationTask) => Promise<CloudConnexaMigrationResult>

/**
 * Runs account migration without allowing overlapping executions in one process
 * or across API/worker processes sharing the same PostgreSQL database.
 */
export default class CloudConnexaMigrationRunner {
  private inFlight?: Promise<CloudConnexaMigrationResult>

  constructor(
    private readonly migrate: MigrationTask = () =>
      new CloudConnexaMigrationService().migrateIfAccountChanged(),
    private readonly withLock: LockTask = (task) =>
      db.transaction(async (trx) => {
        await trx.rawQuery('SELECT pg_advisory_xact_lock(hashtext(?))', [LOCK_KEY])
        return task()
      })
  ) {}

  run(): Promise<CloudConnexaMigrationResult> {
    if (this.inFlight) return this.inFlight

    this.inFlight = this.withLock(this.migrate).finally(() => {
      this.inFlight = undefined
    })

    return this.inFlight
  }
}
