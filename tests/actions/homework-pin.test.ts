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

// === 추가 edge case 검증 (verification 단계에서 추가) ===

describe('pin edge cases', () => {
  it('overwrites pinnedDate when pinned again (오늘 → 내일)', async () => {
    const appDb = makeDb()
    const { item } = insertCommittedItem(appDb, '2026-07-01')
    await pinHomeworkToDate(item.id, '2026-05-29', { appDb })
    await pinHomeworkToDate(item.id, '2026-05-30', { appDb })
    const row = appDb.select().from(appSchema.homeworkItems).where(eq(appSchema.homeworkItems.id, item.id)).get()
    expect(row?.pinnedDate).toBe('2026-05-30')
  })

  it('past pinnedDate still appears in listTodoByDueWithin (catch-up behavior)', async () => {
    const appDb = makeDb()
    const { item } = insertCommittedItem(appDb, '2026-07-01')
    // 어제 핀 — 사용자가 어제 미리 보이게 해놨는데 아직 안 한 케이스
    await pinHomeworkToDate(item.id, '2026-05-28', { appDb })
    const list = await listTodoByDueWithin('2026-05-29', 1, { appDb })
    // pinnedDate <= endIso (2026-05-30) 이므로 포함됨 — 아이 홈에 계속 노출
    expect(list.map((it) => it.id)).toContain(item.id)
  })

  // ⚠️ 실패하는 회귀 테스트 — listTodoByDueWithin/Between의 WHERE 절 우선순위 버그를 노출.
  // 생성된 SQL:
  //   WHERE (A AND B AND (dueDate ...) OR (pinnedDate ...))
  // 의도:
  //   WHERE (A AND B AND ((dueDate ...) OR (pinnedDate ...)))
  // 결과: pinnedDate가 범위 안인 row는 done_at IS NULL / is_committed=1 필터를 우회.
  // 수정 방안: drizzle의 `or()` 헬퍼로 wrap하거나 sql template 전체를 `sql\`(... OR ...)\`` 한 번 더 감싸기.
  it.fails('excludes done items even when pinned (WHERE precedence bug)', async () => {
    const appDb = makeDb()
    const { item } = insertCommittedItem(appDb, '2026-07-01')
    await pinHomeworkToDate(item.id, '2026-05-29', { appDb })
    // 완료 처리
    appDb.update(appSchema.homeworkItems).set({ doneAt: new Date() })
      .where(eq(appSchema.homeworkItems.id, item.id)).run()
    const list = await listTodoByDueWithin('2026-05-29', 1, { appDb })
    expect(list.map((it) => it.id)).not.toContain(item.id)
  })

  // 같은 우선순위 버그가 listTodoByDueBetween에도 존재.
  it.fails('listTodoByDueBetween excludes done items even when pinned (WHERE precedence bug)', async () => {
    const appDb = makeDb()
    const { item } = insertCommittedItem(appDb, '2026-07-01')
    await pinHomeworkToDate(item.id, '2026-05-29', { appDb })
    appDb.update(appSchema.homeworkItems).set({ doneAt: new Date() })
      .where(eq(appSchema.homeworkItems.id, item.id)).run()
    const list = await listTodoByDueBetween('2026-05-29', '2026-05-29', { appDb })
    expect(list.map((it) => it.id)).not.toContain(item.id)
  })

  it('orders by COALESCE(pinnedDate, dueDate) — pinnedDate가 먼저', async () => {
    const appDb = makeDb()
    // item A: dueDate=2026-05-29 (오늘), 핀 없음 → 정렬 키 = 2026-05-29
    const { item: a } = insertCommittedItem(appDb, '2026-05-29')
    // item B: dueDate=2026-07-01 (미래), 핀 2026-05-28 → 정렬 키 = 2026-05-28 (먼저)
    const { item: b } = insertCommittedItem(appDb, '2026-07-01')
    await pinHomeworkToDate(b.id, '2026-05-28', { appDb })
    const list = await listTodoByDueWithin('2026-05-29', 1, { appDb })
    // B의 정렬 키(2026-05-28)가 A의 정렬 키(2026-05-29)보다 빠르므로 B가 먼저.
    const ids = list.map((it) => it.id)
    expect(ids.indexOf(b.id)).toBeLessThan(ids.indexOf(a.id))
  })

  it('unpin leaves dueDate-only behavior intact', async () => {
    const appDb = makeDb()
    const { item } = insertCommittedItem(appDb, '2026-07-01')
    await pinHomeworkToDate(item.id, '2026-05-29', { appDb })
    await unpinHomework(item.id, { appDb })
    // 핀 풀면 dueDate(2026-07-01)는 오늘+1 범위 밖이라 노출 안 됨
    const list = await listTodoByDueWithin('2026-05-29', 1, { appDb })
    expect(list.map((it) => it.id)).not.toContain(item.id)
  })
})
