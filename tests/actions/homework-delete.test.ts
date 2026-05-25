import { describe, it, expect } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { eq } from 'drizzle-orm'
import * as appSchema from '@/server/db/schema'
import { deleteHomeworkItem, updateHomeworkItem } from '@/server/actions/homework'

function makeDb() {
  const dir = mkdtempSync(join(tmpdir(), 'fs-delete-'))
  const appPath = join(dir, 'app.db')
  const sqlite = new Database(appPath)
  sqlite.pragma('foreign_keys = ON')
  const appDb = drizzle(sqlite, { schema: appSchema })
  migrate(appDb, { migrationsFolder: './server/db/migrations' })
  return appDb
}

function insertCommittedItem(appDb: ReturnType<typeof makeDb>, overrides: { isCommitted?: boolean } = {}) {
  const [academy] = appDb.insert(appSchema.academies).values({ name: 'A', subject: 'math', color: '#000' }).returning().all()
  const [batch] = appDb.insert(appSchema.homeworkBatches).values({ academyId: academy.id, status: 'committed' }).returning().all()
  const [item] = appDb.insert(appSchema.homeworkItems).values({
    batchId: batch.id,
    academyId: academy.id,
    title: '숙제',
    notes: '메모',
    source: 'ai',
    isCommitted: overrides.isCommitted ?? true,
    dueDate: '2026-06-01',
  }).returning().all()
  return { academy, batch, item }
}

describe('deleteHomeworkItem', () => {
  it('deletes a committed item by id', async () => {
    const appDb = makeDb()
    const { item } = insertCommittedItem(appDb)
    const res = await deleteHomeworkItem(item.id, { appDb })
    expect(res.ok).toBe(true)
    const row = appDb.select().from(appSchema.homeworkItems).where(eq(appSchema.homeworkItems.id, item.id)).get()
    expect(row).toBeUndefined()
  })

  it('rejects a non-existent id', async () => {
    const appDb = makeDb()
    const res = await deleteHomeworkItem(99999, { appDb })
    expect(res.ok).toBe(false)
    expect(res.error).toBeTruthy()
  })

  it('rejects a draft (non-committed) item', async () => {
    const appDb = makeDb()
    const { item } = insertCommittedItem(appDb, { isCommitted: false })
    const res = await deleteHomeworkItem(item.id, { appDb })
    expect(res.ok).toBe(false)
    const row = appDb.select().from(appSchema.homeworkItems).where(eq(appSchema.homeworkItems.id, item.id)).get()
    expect(row).toBeDefined()
  })
})

describe('updateHomeworkItem', () => {
  it('updates title, notes, dueDate', async () => {
    const appDb = makeDb()
    const { item } = insertCommittedItem(appDb)
    const res = await updateHomeworkItem(item.id, { title: '새 제목', notes: '새 메모', dueDate: '2026-07-01' }, { appDb })
    expect(res.ok).toBe(true)
    const row = appDb.select().from(appSchema.homeworkItems).where(eq(appSchema.homeworkItems.id, item.id)).get()
    expect(row?.title).toBe('새 제목')
    expect(row?.notes).toBe('새 메모')
    expect(row?.dueDate).toBe('2026-07-01')
  })

  it('rejects empty title', async () => {
    const appDb = makeDb()
    const { item } = insertCommittedItem(appDb)
    const res = await updateHomeworkItem(item.id, { title: '  ' }, { appDb })
    expect(res.ok).toBe(false)
  })

  it('rejects invalid dueDate format', async () => {
    const appDb = makeDb()
    const { item } = insertCommittedItem(appDb)
    const res = await updateHomeworkItem(item.id, { dueDate: '01/07/2026' }, { appDb })
    expect(res.ok).toBe(false)
  })

  it('allows clearing dueDate to null', async () => {
    const appDb = makeDb()
    const { item } = insertCommittedItem(appDb)
    const res = await updateHomeworkItem(item.id, { dueDate: null }, { appDb })
    expect(res.ok).toBe(true)
    const row = appDb.select().from(appSchema.homeworkItems).where(eq(appSchema.homeworkItems.id, item.id)).get()
    expect(row?.dueDate).toBeNull()
  })
})
