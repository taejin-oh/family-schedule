import { describe, it, expect } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import * as appSchema from '@/server/db/schema'
import { gatherWeeklyStats } from '@/server/notifications/weekly-report'

function makeDb() {
  const dir = mkdtempSync(join(tmpdir(), 'fs-wr-'))
  const sqlite = new Database(join(dir, 'app.db')); sqlite.pragma('foreign_keys = ON')
  const db = drizzle(sqlite, { schema: appSchema })
  migrate(db, { migrationsFolder: './server/db/migrations' })
  return db
}
function seedAcademy(db: ReturnType<typeof makeDb>, name: string) {
  const [a] = db.insert(appSchema.academies).values({ name, subject: 'math', color: '#000' }).returning().all()
  const [b] = db.insert(appSchema.homeworkBatches).values({ academyId: a.id, status: 'committed' }).returning().all()
  return { academyId: a.id, batchId: b.id }
}
function seedItem(db: ReturnType<typeof makeDb>, ctx: { academyId: number; batchId: number }, o: {
  title: string; dueDate?: string | null; doneAt?: Date | null; score?: '상'|'중'|'하'|null
}) {
  db.insert(appSchema.homeworkItems).values({
    batchId: ctx.batchId, academyId: ctx.academyId, title: o.title, source: 'manual',
    isCommitted: true, dueDate: o.dueDate ?? null, doneAt: o.doneAt ?? null, score: o.score ?? null,
  }).run()
}

describe('gatherWeeklyStats', () => {
  it('주 안에 완료된 숙제만 집계하고 점수 분포·지연을 계산한다', () => {
    const db = makeDb()
    const eng = seedAcademy(db, '영어')
    // 주: 2026-06-15(월) ~ 2026-06-21(일). 완료시각은 그 주 안.
    const inWeek = new Date('2026-06-17T10:00:00')
    seedItem(db, eng, { title: '제때 완료 상', dueDate: '2026-06-18', doneAt: inWeek, score: '상' })   // 마감 전 완료
    seedItem(db, eng, { title: '지연 완료 하', dueDate: '2026-06-16', doneAt: inWeek, score: '하' })   // 마감 후 완료(지연)
    seedItem(db, eng, { title: '점수 미기록', dueDate: '2026-06-18', doneAt: inWeek, score: null })
    seedItem(db, eng, { title: '지난 주 완료', dueDate: '2026-06-10', doneAt: new Date('2026-06-10T10:00:00') }) // 제외
    seedItem(db, eng, { title: '미완료', dueDate: '2026-06-19', doneAt: null })                          // 완료 아님 → 제외

    const s = gatherWeeklyStats(db, '2026-06-15', '2026-06-21')
    expect(s.totalCompleted).toBe(3)
    expect(s.lateCount).toBe(1)
    expect(s.scoreDist).toEqual({ '상': 1, '중': 0, '하': 1, '미기록': 1 })
    expect(s.byAcademy['영어'].completed).toBe(3)
    expect(s.completed.map((c) => c.title)).toContain('제때 완료 상')
    expect(s.completed.map((c) => c.title)).not.toContain('지난 주 완료')
  })
})
