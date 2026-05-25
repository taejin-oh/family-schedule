import { describe, it, expect } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { eq } from 'drizzle-orm'
import * as appSchema from '@/server/db/schema'
import { createEmptyBatch } from '@/server/actions/homework'

function makeDb() {
  const dir = mkdtempSync(join(tmpdir(), 'fs-empty-'))
  const sqlite = new Database(join(dir, 'app.db'))
  sqlite.pragma('foreign_keys = ON')
  const appDb = drizzle(sqlite, { schema: appSchema })
  migrate(appDb, { migrationsFolder: './server/db/migrations' })
  return appDb
}

describe('createEmptyBatch', () => {
  it('creates a batch with status=ready for a valid academy', async () => {
    const appDb = makeDb()
    const [academy] = appDb.insert(appSchema.academies).values({ name: 'A', subject: 'math', color: '#000000' }).returning().all()
    const res = await createEmptyBatch(academy.id, { appDb })
    expect(res.ok).toBe(true)
    if (!res.ok) throw new Error(res.error)
    const batch = appDb.select().from(appSchema.homeworkBatches).where(eq(appSchema.homeworkBatches.id, res.data.batchId)).get()
    expect(batch?.status).toBe('ready')
  })

  it('returns the new batchId', async () => {
    const appDb = makeDb()
    const [academy] = appDb.insert(appSchema.academies).values({ name: 'A', subject: 'math', color: '#000000' }).returning().all()
    const res = await createEmptyBatch(academy.id, { appDb })
    expect(res.ok).toBe(true)
    if (!res.ok) throw new Error(res.error)
    expect(res.data.batchId).toBeGreaterThan(0)
  })

  it('creates no photo rows (empty = manual-entry flow)', async () => {
    const appDb = makeDb()
    const [academy] = appDb.insert(appSchema.academies).values({ name: 'A', subject: 'math', color: '#000000' }).returning().all()
    const res = await createEmptyBatch(academy.id, { appDb })
    if (!res.ok) throw new Error(res.error)
    const photos = appDb.select().from(appSchema.homeworkPhotos).all()
    expect(photos).toHaveLength(0)
  })

  it('returns error for non-existent academyId', async () => {
    const appDb = makeDb()
    const res = await createEmptyBatch(9999, { appDb })
    expect(res.ok).toBe(false)
  })

  it('allows creating a batch for an archived academy (코드가 archive 검사를 하지 않음)', async () => {
    // NOTE: createEmptyBatch does NOT check archivedAt — it only checks if the row exists.
    // This test documents the current behavior: archived academies are accepted.
    const appDb = makeDb()
    const [academy] = appDb.insert(appSchema.academies).values({ name: 'A', subject: 'math', color: '#000000' }).returning().all()
    appDb.update(appSchema.academies).set({ archivedAt: new Date() }).where(eq(appSchema.academies.id, academy.id)).run()
    const res = await createEmptyBatch(academy.id, { appDb })
    // Current behavior: returns ok:true even for archived academies
    expect(res.ok).toBe(true)
  })
})
