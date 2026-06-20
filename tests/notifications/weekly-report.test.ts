import { describe, it, expect } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { eq } from 'drizzle-orm'
import * as appSchema from '@/server/db/schema'
import { gatherWeeklyStats, summarizeWeek, buildWeeklyReport } from '@/server/notifications/weekly-report'

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
  title: string; dueDate?: string | null; doneAt?: Date | null; score?: number | null
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
    seedItem(db, eng, { title: '제때 완료 별5', dueDate: '2026-06-18', doneAt: inWeek, score: 5 })   // 마감 전 완료
    seedItem(db, eng, { title: '지연 완료 별1', dueDate: '2026-06-16', doneAt: inWeek, score: 1 })   // 마감 후 완료(지연)
    seedItem(db, eng, { title: '점수 미기록', dueDate: '2026-06-18', doneAt: inWeek, score: null })
    seedItem(db, eng, { title: '지난 주 완료', dueDate: '2026-06-10', doneAt: new Date('2026-06-10T10:00:00') }) // 제외
    seedItem(db, eng, { title: '미완료', dueDate: '2026-06-19', doneAt: null })                          // 완료 아님 → 제외

    const s = gatherWeeklyStats(db, '2026-06-15', '2026-06-21')
    expect(s.totalCompleted).toBe(3)
    expect(s.lateCount).toBe(1)
    expect(s.ratedCount).toBe(2)
    expect(s.unscoredCount).toBe(1)
    expect(s.avgStars).toBe(3)            // (5 + 1) / 2
    expect(s.starDist[5]).toBe(1)
    expect(s.starDist[1]).toBe(1)
    expect(s.byAcademy['영어'].completed).toBe(3)
    expect(s.byAcademy['영어'].avgStars).toBe(3)
    expect(s.completed.map((c) => c.title)).toContain('제때 완료 별5')
    expect(s.completed.map((c) => c.title)).not.toContain('지난 주 완료')
  })

  it('매일/매주 할일: 예정 횟수 대비 완료·별점 평균', () => {
    const db = makeDb()
    const [task] = db.insert(appSchema.recurringTasks).values({
      title: '독서', cadence: 'daily', daysOfWeek: ['mon', 'tue', 'wed', 'thu', 'fri'],
    }).returning().all()
    // 이번 주(2026-06-15~21) 완료 2건(별점 4 / 미기록), 지난 주 1건은 제외.
    db.insert(appSchema.recurringTaskCompletions).values({ taskId: task.id, completionDate: '2026-06-16', score: 4 }).run()
    db.insert(appSchema.recurringTaskCompletions).values({ taskId: task.id, completionDate: '2026-06-17', score: null }).run()
    db.insert(appSchema.recurringTaskCompletions).values({ taskId: task.id, completionDate: '2026-06-08', score: 5 }).run()

    const s = gatherWeeklyStats(db, '2026-06-15', '2026-06-21')
    const r = s.recurring.find((x) => x.title === '독서')!
    expect(r.scheduled).toBe(5)   // mon-fri
    expect(r.completed).toBe(2)   // 이번 주 2건
    expect(r.ratedCount).toBe(1)
    expect(r.avgStars).toBe(4)
  })
})

const FAKE_STATS = {
  weekStartIso: '2026-06-15', weekEndIso: '2026-06-21', totalCompleted: 3, lateCount: 1,
  ratedCount: 2, unscoredCount: 1, avgStars: 3, starDist: { 0: 0, 1: 1, 2: 0, 3: 0, 4: 0, 5: 1 },
  byAcademy: {}, completed: [], openAtWeekEnd: 2, recurring: [],
}

describe('summarizeWeek', () => {
  it('주입한 러너의 서술을 트림해서 반환', async () => {
    const run = async () => '  이번 주 잘했어요.  '
    const out = await summarizeWeek(FAKE_STATS as never, { provider: 'codex', model: 'gpt-5.5', run })
    expect(out).toBe('이번 주 잘했어요.')
  })
  it('러너가 throw하면 null', async () => {
    const run = async () => { throw new Error('cli fail') }
    const out = await summarizeWeek(FAKE_STATS as never, { provider: 'codex', model: 'gpt-5.5', run })
    expect(out).toBeNull()
  })
})

describe('buildWeeklyReport', () => {
  it('서술 생성 + weekly_reports upsert + 텍스트에 통계·서술 포함', async () => {
    const db = makeDb()
    const eng = seedAcademy(db, '영어')
    seedItem(db, eng, { title: 'A', dueDate: '2026-06-18', doneAt: new Date('2026-06-17T10:00:00'), score: 5 })
    const run = async () => 'AI 서술: 영어 숙제를 성실히 끝냈어요.'
    const r = await buildWeeklyReport(db, '2026-06-15', '2026-06-21', { provider: 'codex', model: 'gpt-5.5', run, now: 1_750_000_000_000 })
    expect(r.text).toContain('완료')
    expect(r.text).toContain('AI 서술')
    const row = db.select().from(appSchema.weeklyReports).where(eq(appSchema.weeklyReports.weekStartIso, '2026-06-15')).get()
    expect(row?.narrative).toContain('AI 서술')
    expect(row?.model).toBe('codex/gpt-5.5')
  })
  it('LLM 실패 시 템플릿 폴백으로도 저장·발송 가능', async () => {
    const db = makeDb()
    const eng = seedAcademy(db, '영어')
    seedItem(db, eng, { title: 'A', dueDate: '2026-06-18', doneAt: new Date('2026-06-17T10:00:00'), score: 5 })
    const run = async () => { throw new Error('fail') }
    const r = await buildWeeklyReport(db, '2026-06-15', '2026-06-21', { provider: 'codex', model: 'gpt-5.5', run, now: 1_750_000_000_000 })
    expect(r.model).toBe('template')
    expect(r.text.length).toBeGreaterThan(0)
    const row = db.select().from(appSchema.weeklyReports).where(eq(appSchema.weeklyReports.weekStartIso, '2026-06-15')).get()
    expect(row).toBeTruthy()
  })
})
