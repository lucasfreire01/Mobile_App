import db from '@adonisjs/lucid/services/db'
import encryption from '@adonisjs/core/services/encryption'

export default class SharedCacheService {
  async get<T>(key: string): Promise<T | null> {
    const row = await db.from('saganexus_shared_cache').where('key', key).where('expires_at', '>', new Date()).first()
    if (!row) return null
    try {
      return encryption.decrypt(row.payload) as T
    } catch {
      return null
    }
  }

  async put<T>(key: string, value: T, ttlMs: number) {
    const expiresAt = new Date(Date.now() + ttlMs)
    await db
      .table('saganexus_shared_cache')
      .insert({ key, payload: encryption.encrypt(value), expires_at: expiresAt, updated_at: new Date() })
      .onConflict('key')
      .merge()
  }
}
