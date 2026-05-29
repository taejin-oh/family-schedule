import { describe, it, expect } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { eq } from 'drizzle-orm'
import * as appSchema from '@/server/db/schema'
import {
  pinHomeworkToDate,
  unpinHomework,
  listTodoByDueWithin,
  listTodoByDueBetween,
} from '@/server/actions/homework'

function makeDb() {
  const dir = mkdtempSync(join(tmpdir(), 'fs-pin-'))
  const appPath = join(dir, 'app.db')
  const sqlite = new Database(appPath)
  sqlite.pragma('foreign_keys = ON')
  const appDb = drizzle(sqlite, { schema: appSchema })
  migrate(appDb, { migrationsFolder: './server/db/migrations' })
  return appDb
}

function insertCommittedItem(
  appDb: ReturnType<typeof makeDb>,
  dueDate: string | null = '2026-06-30',
) {
  const [academy] = appDb.insert(appSchema.academies).values({
    name: 'X', subject: 'math', color: '#000000',
  }).returning().all()
  const [batch] = appDb.insert(appSchema.homeworkBatches).values({
    academyId: academy.id, status: 'committed',
  }).returning().all()
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

describe('pinHomeworkToDate', () => {
  it('sets pinnedDate on a committed item without touching dueDate', async () => {
    const appDb = makeDb()
    const { item } = insertCommittedItem(appDb, '2026-06-30')
    const res = await pinHomeworkToDate(item.id, '2026-05-29', { appDb })
    expect(res.ok).toBe(true)
    const row = appDb.select().from(appSchema.homeworkItems).where(eq(appSchema.homeworkItems.id, item.id)).get()
    expect(row?.pinnedDate).toBe('2026-05-29')
    // dueDate는 그대로
    expect(row?.dueDate).toBe('2026-06-30')
  })

  it('rejects an invalid date format', async () => {
    const appDb = makeDb()
    const { item } = insertCommittedItem(appDb)
    const res = await pinHomeworkToDate(item.id, '05/29/2026', { appDb })
    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/잘못된 날짜/)
  })

  it('rejects a draft (non-committed) item', async () => {
    const appDb = makeDb()
    const [academy] = appDb.insert(appSchema.academies).values({
      name: 'X', subject: 'math', color: '#000000',
    }).returning().all()
    const [batch] = appDb.insert(appSchema.homeworkBatches).values({
      academyId: academy.id, status: 'ready',
    }).returning().all()
    const [item] = appDb.insert(appSchema.homeworkItems).values({
      batchId: batch.id, academyId: academy.id, title: '초안', source: 'ai',
      isCommitted: false, dueDate: '2026-06-01',
    }).returning().all()
    const res = await pinHomeworkToDate(item.id, '2026-05-29', { appDb })
    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/확정/)
    const row = appDb.select().from(appSchema.homeworkItems).where(eq(appSchema.homeworkItems.id, item.id)).get()
    expect(row?.pinnedDate).toBeNull()
  })

  it('rejects a non-existent itemId', async () => {
    const appDb = makeDb()
    const res = await pinHomeworkToDate(99999, '2026-05-29', { appDb })
    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/항목|없/)
  })
})

describe('unpinHomework', () => {
  it('clears pinnedDate', async () => {
    const appDb = makeDb()
    const { item } = insertCommittedItem(appDb, '2026-06-30')
    await pinHomeworkToDate(item.id, '2026-05-29', { appDb })
    const res = await unpinHomework(item.id, { appDb })
    expect(res.ok).toBe(true)
    const row = appDb.select().from(appSchema.homeworkItems).where(eq(appSchema.homeworkItems.id, item.id)).get()
    expect(row?.pinnedDate).toBeNull()
    // dueDate 영향 없음
    expect(row?.dueDate).toBe('2026-06-30')
  })

  it('rejects a non-existent itemId', async () => {
    const appDb = makeDb()
    const res = await unpinHomework(99999, { appDb })
    expect(res.ok).toBe(false)
  })
})

describe('listTodoByDueWithin with pinnedDate', () => {
  it('includes items pinned to today even if dueDate is far in the future', async () => {
    const appDb = makeDb()
    // dueDate 한 달 뒤 — 평소엔 오늘 리스트에 안 나옴.
    const { item } = insertCommittedItem(appDb, '2026-06-30')
    // 오늘로 핀
    await pinHomeworkToDate(item.id, '2026-05-29', { appDb })
    const list = await listTodoByDueWithin('2026-05-29', 1, { appDb })
    expect(list.map((it) => it.id)).toContain(item.id)
    expect(list[0].pinnedDate).toBe('2026-05-29')
  })

  it('excludes items pinned beyond the window', async () => {
    const appDb = makeDb()
    const { item } = insertCommittedItem(appDb, '2026-06-30')
    // 모레로 핀 — today=05-29, maxDays=1 (내일까지) 범위 밖
    await pinHomeworkToDate(item.id, '2026-05-31', { appDb })
    const list = await listTodoByDueWithin('2026-05-29', 1, { appDb })
    expect(list.map((it) => it.id)).not.toContain(item.id)
  })

  it('keeps dueDate-based items when not pinned', async () => {
    const appDb = makeDb()
    const { item } = insertCommittedItem(appDb, '2026-05-29')
    const list = await listTodoByDueWithin('2026-05-29', 1, { appDb })
    expect(list.map((it) => it.id)).toContain(item.id)
    expect(list[0].pinnedDate).toBeNull()
  })
})

describe('listTodoByDueBetween with pinnedDate', () => {
  it('includes items pinned within the range even with future dueDate', async () => {
    const appDb = makeDb()
    const { item } = insertCommittedItem(appDb, '2026-07-01')
    await pinHomeworkToDate(item.id, '2026-05-30', { appDb })
    const list = await listTodoByDueBetween('2026-05-30', '2026-05-30', { appDb })
    expect(list.map((it) => it.id)).toContain(item.id)
  })
})
