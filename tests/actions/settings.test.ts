import { describe, it, expect } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import * as schema from '@/server/db/schema'
import { getSettings, updateSettings } from '@/server/actions/settings'

function makeDb() {
  const path = join(mkdtempSync(join(tmpdir(), 'fs-set-')), 'app.db')
  const sqlite = new Database(path); sqlite.pragma('foreign_keys = ON')
  const db = drizzle(sqlite, { schema })
  migrate(db, { migrationsFolder: './server/db/migrations' })
  db.insert(schema.appSettings).values({ id: 1 }).onConflictDoNothing().run()
  return db
}

describe('settings', () => {
  it('getSettings returns defaults', async () => {
    const db = makeDb()
    const s = await getSettings({ appDb: db })
    expect(s.visionProvider).toBe('claude')
    expect(s.visionModel).toBe('claude-opus-4-7')
  })

  it('updateSettings persists provider+model', async () => {
    const db = makeDb()
    const res = await updateSettings({ visionProvider: 'claude', visionModel: 'claude-opus-4-7' }, { appDb: db })
    expect(res.ok).toBe(true)
    const s = await getSettings({ appDb: db })
    expect(s.visionModel).toBe('claude-opus-4-7')
  })

  it('updateSettings rejects unknown provider', async () => {
    const db = makeDb()
    const res = await updateSettings({ visionProvider: 'xyz', visionModel: 'claude-opus-4-7' }, { appDb: db })
    expect(res.ok).toBe(false)
  })
})
