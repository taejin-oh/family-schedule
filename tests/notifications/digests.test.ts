import { describe, it, expect } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import * as schema from '@/server/db/schema'
import { buildMorningDigest, buildEveningDigest, buildMiddayDigest } from '@/server/notifications/digests'

function makeDb() {
  const path = join(mkdtempSync(join(tmpdir(), 'fs-dig-')), 'app.db')
  const sqlite = new Database(path)
  sqlite.pragma('foreign_keys = ON')
  const db = drizzle(sqlite, { schema })
  migrate(db, { migrationsFolder: './server/db/migrations' })
  db.insert(schema.appSettings).values({ id: 1 }).onConflictDoNothing().run()
  return db
}

// Insert a test academy with a schedule slot
function insertAcademy(db: ReturnType<typeof makeDb>, name: string, day: schema.Day, start: string, end: string) {
  const [row] = db.insert(schema.academies).values({
    name,
    subject: 'test',
    color: '#000',
    scheduleRule: { slots: [{ day, start, end }] },
  }).returning({ id: schema.academies.id }).all()
  return row.id
}

// Insert a homework batch (needed for FK)
function insertBatch(db: ReturnType<typeof makeDb>, academyId: number) {
  const [row] = db.insert(schema.homeworkBatches).values({
    academyId,
    status: 'committed',
  }).returning({ id: schema.homeworkBatches.id }).all()
  return row.id
}

// Insert a committed, undone homework item
function insertHomework(db: ReturnType<typeof makeDb>, academyId: number, title: string, dueDate: string | null) {
  const batchId = insertBatch(db, academyId)
  db.insert(schema.homeworkItems).values({
    batchId,
    academyId,
    title,
    source: 'manual',
    dueDate,
    isCommitted: true,
  }).run()
}

describe('buildMorningDigest', () => {
  it('includes today academy slots and due homework', () => {
    const db = makeDb()
    // 2026-05-25 is Monday (월)
    const academyId = insertAcademy(db, '수학학원', 'mon', '17:00', '18:30')
    insertHomework(db, academyId, '문제집 p.20-30', '2026-05-25')

    const text = buildMorningDigest(db, '2026-05-25')

    expect(text).toContain('2026-05-25 월')
    expect(text).toContain('수학학원')
    expect(text).toContain('17:00–18:30')
    expect(text).toContain('[수학학원] 문제집 p.20-30 (오늘)')
  })

  it('shows empty messages when no academies or homework', () => {
    const db = makeDb()
    const text = buildMorningDigest(db, '2026-05-25')

    expect(text).toContain('오늘 학원 없음')
    expect(text).toContain('오늘은 마감 없어요')
  })

  it('shows correct Korean day for each weekday', () => {
    const db = makeDb()
    expect(buildMorningDigest(db, '2026-05-24')).toContain('2026-05-24 일')
    expect(buildMorningDigest(db, '2026-05-25')).toContain('2026-05-25 월')
    expect(buildMorningDigest(db, '2026-05-26')).toContain('2026-05-26 화')
    expect(buildMorningDigest(db, '2026-05-27')).toContain('2026-05-27 수')
    expect(buildMorningDigest(db, '2026-05-28')).toContain('2026-05-28 목')
    expect(buildMorningDigest(db, '2026-05-29')).toContain('2026-05-29 금')
    expect(buildMorningDigest(db, '2026-05-30')).toContain('2026-05-30 토')
  })

  it('on Sunday, shows "이번 주 끝낼 거" label instead', () => {
    const db = makeDb()
    // 2026-05-24 is Sunday
    const text = buildMorningDigest(db, '2026-05-24')
    expect(text).toContain('이번 주 끝낼 거')
    // 일요일엔 "오늘까지 끝낼 거" 라벨 X
    expect(text).not.toContain('오늘까지 끝낼 거')
  })

  it('counts yesterday-or-earlier overdue items', () => {
    const db = makeDb()
    const academyId = insertAcademy(db, 'X', 'mon', '17:00', '18:30')
    // 2026-05-25 기준 어제(05-24)와 5일 전(05-20)에 마감
    insertHomework(db, academyId, '어제꺼', '2026-05-24')
    insertHomework(db, academyId, '5일전꺼', '2026-05-20')

    const text = buildMorningDigest(db, '2026-05-25')
    expect(text).toContain('어제까지 마감 (0/2 완료)')
    expect(text).toContain('1일 지남')
    expect(text).toContain('5일 지남')
  })
})

describe('buildEveningDigest (오늘 정리 + 내일 마감)', () => {
  it('shows tomorrow due homework in 내일 마감 section', () => {
    const db = makeDb()
    const academyId = insertAcademy(db, '영어학원', 'tue', '19:00', '20:30')
    insertHomework(db, academyId, '단어 100개', '2026-05-26')

    const text = buildEveningDigest(db, '2026-05-25')

    expect(text).toContain('오늘 정리')
    expect(text).toContain('내일 마감')
    expect(text).toContain('[영어학원] 단어 100개')
  })

  it('shows "내일은 마감 없어요" when no tomorrow homework', () => {
    const db = makeDb()
    const text = buildEveningDigest(db, '2026-05-25')
    expect(text).toContain('내일은 마감 없어요')
  })

  it('includes 오늘 다녀온 학원 section when slots exist', () => {
    const db = makeDb()
    // 2026-05-25 is Monday
    insertAcademy(db, '수학학원', 'mon', '17:00', '18:30')
    const text = buildEveningDigest(db, '2026-05-25')
    expect(text).toContain('오늘 다녀온 학원')
    expect(text).toContain('수학학원')
  })

  it('shows heuristic 제안 only when items 3+ days overdue', () => {
    const db = makeDb()
    const academyId = insertAcademy(db, '수학학원', 'mon', '17:00', '18:30')
    insertHomework(db, academyId, '오래 묵은 거', '2026-05-22')  // 3일 지남
    const text = buildEveningDigest(db, '2026-05-25')
    expect(text).toContain('💡')  // 제안 섹션 헤더
    expect(text).toContain('3일째')
  })

  it('no 제안 when no long-overdue items', () => {
    const db = makeDb()
    const academyId = insertAcademy(db, '수학학원', 'mon', '17:00', '18:30')
    insertHomework(db, academyId, '오늘꺼', '2026-05-25')
    const text = buildEveningDigest(db, '2026-05-25')
    expect(text).not.toContain('💡')
  })
})

describe('buildMiddayDigest', () => {
  it('shows today due and overdue homework', () => {
    const db = makeDb()
    const academyId = insertAcademy(db, '수학학원', 'mon', '17:00', '18:30')
    insertHomework(db, academyId, '오늘 문제', '2026-05-25')
    insertHomework(db, academyId, '지난 문제', '2026-05-20')

    const text = buildMiddayDigest(db, '2026-05-25')

    expect(text).toContain('[수학학원] 오늘 문제')
    expect(text).toContain('[수학학원]')
    expect(text).toContain('5일 지남')
    expect(text).toContain('지난 문제')
  })

  it('shows all clear message when nothing is pending', () => {
    const db = makeDb()
    const text = buildMiddayDigest(db, '2026-05-25')
    expect(text).toContain('정리 완료')
    expect(text).toContain('미완료 항목 없음')
  })

  it('shows none for overdue when only today homework', () => {
    const db = makeDb()
    const academyId = insertAcademy(db, '수학학원', 'mon', '17:00', '18:30')
    insertHomework(db, academyId, '오늘 문제', '2026-05-25')

    const text = buildMiddayDigest(db, '2026-05-25')

    expect(text).toContain('[수학학원] 오늘 문제')
    // overdue section shows 없음
    const lines = text.split('\n')
    const overdueIdx = lines.findIndex((l) => l.startsWith('기한 지남'))
    expect(overdueIdx).toBeGreaterThan(-1)
    expect(lines[overdueIdx + 1]).toBe('• 없음')
  })
})
