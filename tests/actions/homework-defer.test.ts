import { describe, it, expect } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { eq } from 'drizzle-orm'
import * as appSchema from '@/server/db/schema'
import { deferHomework } from '@/server/actions/homework'

function makeDb() {
  const dir = mkdtempSync(join(tmpdir(), 'fs-defer-'))
  const appPath = join(dir, 'app.db')
  const sqlite = new Database(appPath)
  sqlite.pragma('foreign_keys = ON')
  const appDb = drizzle(sqlite, { schema: appSchema })
  migrate(appDb, { migrationsFolder: './server/db/migrations' })
  return appDb
}

function insertCommittedItem(appDb: ReturnType<typeof makeDb>, dueDate: string | null = '2026-05-30') {
  const [academy] = appDb.insert(appSchema.academies).values({ name: 'X', subject: 'math', color: '#000000' }).returning().all()
  const [batch] = appDb.insert(appSchema.homeworkBatches).values({ academyId: academy.id, status: 'committed' }).returning().all()
  const [item] = appDb.insert(appSchema.homeworkItems).values({
    batchId: batch.id,
    academyId: academy.id,
    title: '숙제',
    source: 'ai',
    isCommitted: true,
    dueDate,
  }).returning().all()
  return { academy, batch, item }
}

describe('deferHomework', () => {
  it('updates dueDate for a committed item', async () => {
    const appDb = makeDb()
    const { item } = insertCommittedItem(appDb, '2026-05-30')
    const res = await deferHomework(item.id, '2026-06-03', { appDb })
    expect(res.ok).toBe(true)
    const updated = appDb.select().from(appSchema.homeworkItems).where(eq(appSchema.homeworkItems.id, item.id)).get()
    expect(updated?.dueDate).toBe('2026-06-03')
  })

  it('rejects an invalid date format', async () => {
    const appDb = makeDb()
    const { item } = insertCommittedItem(appDb)
    const res = await deferHomework(item.id, '06/03/2026', { appDb })
    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/잘못된 날짜/)
  })

  it('rejects a date string that is not a valid ISO shape', async () => {
    const appDb = makeDb()
    const { item } = insertCommittedItem(appDb)
    const res = await deferHomework(item.id, 'not-a-date', { appDb })
    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/잘못된 날짜/)
  })

  it('rejects a draft (non-committed) item', async () => {
    const appDb = makeDb()
    const [academy] = appDb.insert(appSchema.academies).values({ name: 'X', subject: 'math', color: '#000000' }).returning().all()
    const [batch] = appDb.insert(appSchema.homeworkBatches).values({ academyId: academy.id, status: 'ready' }).returning().all()
    const [item] = appDb.insert(appSchema.homeworkItems).values({
      batchId: batch.id, academyId: academy.id, title: '초안', source: 'ai', isCommitted: false, dueDate: null,
    }).returning().all()
    const res = await deferHomework(item.id, '2026-06-01', { appDb })
    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/확정/)
    // dueDate unchanged
    const row = appDb.select().from(appSchema.homeworkItems).where(eq(appSchema.homeworkItems.id, item.id)).get()
    expect(row?.dueDate).toBeNull()
  })

  it('rejects a non-existent itemId', async () => {
    const appDb = makeDb()
    const res = await deferHomework(99999, '2026-06-01', { appDb })
    expect(res.ok).toBe(false)
    expect(res.error).toBeTruthy()
  })

  it('can defer an item that currently has no due date', async () => {
    const appDb = makeDb()
    const { item } = insertCommittedItem(appDb, null)
    const res = await deferHomework(item.id, '2026-07-01', { appDb })
    expect(res.ok).toBe(true)
    const updated = appDb.select().from(appSchema.homeworkItems).where(eq(appSchema.homeworkItems.id, item.id)).get()
    expect(updated?.dueDate).toBe('2026-07-01')
  })
})
