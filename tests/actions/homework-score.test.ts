import { describe, it, expect } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { eq } from 'drizzle-orm'
import * as appSchema from '@/server/db/schema'
import { setHomeworkScore, listCompletedThisWeekUnscored } from '@/server/actions/homework'

function makeDb() {
  const dir = mkdtempSync(join(tmpdir(), 'fs-score-'))
  const sqlite = new Database(join(dir, 'app.db')); sqlite.pragma('foreign_keys = ON')
  const appDb = drizzle(sqlite, { schema: appSchema })
  migrate(appDb, { migrationsFolder: './server/db/migrations' })
  return appDb
}

function seedDoneItem(appDb: ReturnType<typeof makeDb>, doneAt: Date) {
  // academy → batch(academyId FK) → item 순서로 생성(FK 충족).
  const [academy] = appDb.insert(appSchema.academies).values({
    name: 'A', subject: 'math', color: '#000000',
  }).returning().all()
  const [batch] = appDb.insert(appSchema.homeworkBatches).values({
    academyId: academy.id, status: 'committed',
  }).returning().all()
  const [item] = appDb.insert(appSchema.homeworkItems).values({
    batchId: batch.id, academyId: academy.id, title: 'HW', source: 'manual',
    isCommitted: true, doneAt,
  }).returning().all()
  return item
}

describe('setHomeworkScore', () => {
  it('별점과 이유를 기록한다', async () => {
    const appDb = makeDb()
    const item = seedDoneItem(appDb, new Date())
    const res = await setHomeworkScore(item.id, 5, '깔끔하게 다 풀었음', { appDb })
    expect(res.ok).toBe(true)
    const row = appDb.select().from(appSchema.homeworkItems).where(eq(appSchema.homeworkItems.id, item.id)).get()
    expect(row?.score).toBe(5)
    expect(row?.scoreReason).toBe('깔끔하게 다 풀었음')
  })

  it('0점도 유효한 점수로 저장(미기록 null과 구분)', async () => {
    const appDb = makeDb()
    const item = seedDoneItem(appDb, new Date())
    const res = await setHomeworkScore(item.id, 0, null, { appDb })
    expect(res.ok).toBe(true)
    const row = appDb.select().from(appSchema.homeworkItems).where(eq(appSchema.homeworkItems.id, item.id)).get()
    expect(row?.score).toBe(0)
  })

  it('score=null이면 이유도 비운다', async () => {
    const appDb = makeDb()
    const item = seedDoneItem(appDb, new Date())
    await setHomeworkScore(item.id, 3, '보통', { appDb })
    await setHomeworkScore(item.id, null, '남아있던 이유', { appDb })
    const row = appDb.select().from(appSchema.homeworkItems).where(eq(appSchema.homeworkItems.id, item.id)).get()
    expect(row?.score).toBeNull()
    expect(row?.scoreReason).toBeNull()
  })

  it('범위 밖(6) 점수는 거부한다', async () => {
    const appDb = makeDb()
    const item = seedDoneItem(appDb, new Date())
    const res = await setHomeworkScore(item.id, 6, null, { appDb })
    expect(res.ok).toBe(false)
  })
})

describe('listCompletedThisWeekUnscored', () => {
  it('이번 주 완료 & 점수 미기록만 반환한다', async () => {
    const appDb = makeDb()
    const inWeekUnscored = seedDoneItem(appDb, new Date())            // 이번 주, 미기록
    const inWeekScored = seedDoneItem(appDb, new Date())              // 이번 주, 채점됨
    await setHomeworkScore(inWeekScored.id, 5, null, { appDb })
    seedDoneItem(appDb, new Date('2000-01-03T10:00:00'))             // 옛날 완료 → 제외

    const rows = await listCompletedThisWeekUnscored({ appDb })
    const ids = rows.map((r) => r.id)
    expect(ids).toContain(inWeekUnscored.id)
    expect(ids).not.toContain(inWeekScored.id)
    expect(rows.every((r) => r.id !== undefined && 'academyName' in r)).toBe(true)
  })
})
