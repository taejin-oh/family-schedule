import { describe, it, expect } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import * as schema from '@/server/db/schema'
import {
  createRecurringTask,
  updateRecurringTask,
  archiveRecurringTask,
  markRecurringDone,
  markRecurringUndone,
  listTodayRecurring,
  listRecurringTasks,
} from '@/server/actions/recurring'

type DayKey = 'mon'|'tue'|'wed'|'thu'|'fri'|'sat'|'sun'

function makeDb() {
  const dir = mkdtempSync(join(tmpdir(), 'fs-rec-'))
  const sqlite = new Database(join(dir, 'app.db'))
  sqlite.pragma('foreign_keys = ON')
  const db = drizzle(sqlite, { schema })
  migrate(db, { migrationsFolder: './server/db/migrations' })
  return { db }
}

// Helper: day key for today (0=sun..6=sat)
function todayKey(): DayKey {
  const keys: DayKey[] = ['sun','mon','tue','wed','thu','fri','sat']
  return keys[new Date().getDay()]
}
function notTodayKey(): DayKey {
  const today = new Date().getDay()
  const keys: DayKey[] = ['sun','mon','tue','wed','thu','fri','sat']
  return keys[(today + 1) % 7]
}

describe('createRecurringTask', () => {
  it('accepts valid input and persists a row', async () => {
    const { db } = makeDb()
    const res = await createRecurringTask({ title: '구몬', daysOfWeek: ['mon','wed','fri'] }, { db })
    expect(res.ok).toBe(true)
    const rows = db.select().from(schema.recurringTasks).all()
    expect(rows).toHaveLength(1)
    expect(rows[0].title).toBe('구몬')
    expect(rows[0].color).toBe('#64748b') // default
  })

  it('rejects empty title', async () => {
    const { db } = makeDb()
    const res = await createRecurringTask({ title: '', daysOfWeek: ['mon'] }, { db })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toMatch(/제목/)
  })

  it('rejects empty daysOfWeek', async () => {
    const { db } = makeDb()
    const res = await createRecurringTask({ title: '숙제', daysOfWeek: [] }, { db })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toMatch(/요일/)
  })
})

describe('markRecurringDone + markRecurringUndone', () => {
  it('toggles correctly and double-marking is idempotent', async () => {
    const { db } = makeDb()
    // Insert via createRecurringTask so drizzle json codec handles encoding
    const r0 = await createRecurringTask({ title: '책읽기', daysOfWeek: ['mon','tue','wed','thu','fri'] }, { db })
    expect(r0.ok).toBe(true)
    const task = db.select().from(schema.recurringTasks).all()[0]

    const dateIso = '2026-05-24'

    // Mark done
    const r1 = await markRecurringDone(task.id, dateIso, { db })
    expect(r1.ok).toBe(true)
    const rows1 = db.select().from(schema.recurringTaskCompletions).all()
    expect(rows1).toHaveLength(1)

    // Double-mark is idempotent (no-op)
    const r2 = await markRecurringDone(task.id, dateIso, { db })
    expect(r2.ok).toBe(true)
    const rows2 = db.select().from(schema.recurringTaskCompletions).all()
    expect(rows2).toHaveLength(1) // still just 1 row

    // Mark undone
    const r3 = await markRecurringUndone(task.id, dateIso, { db })
    expect(r3.ok).toBe(true)
    const rows3 = db.select().from(schema.recurringTaskCompletions).all()
    expect(rows3).toHaveLength(0)
  })
})

describe('listTodayRecurring', () => {
  it('includes only tasks scheduled for today, with correct doneAt', async () => {
    const { db } = makeDb()
    const today = todayKey()
    const notToday = notTodayKey()

    // Task scheduled for today — insert via action so JSON encoding is correct
    const r1 = await createRecurringTask({ title: '오늘 과제', daysOfWeek: [today] }, { db })
    expect(r1.ok).toBe(true)
    const taskA = db.select().from(schema.recurringTasks).all()[0]

    // Task NOT scheduled for today
    await createRecurringTask({ title: '다른 날 과제', daysOfWeek: [notToday] }, { db })

    // Archived task for today — should NOT appear
    const r3 = await createRecurringTask({ title: '보관된 과제', daysOfWeek: [today] }, { db })
    expect(r3.ok).toBe(true)
    if (!r3.ok) return
    await archiveRecurringTask(r3.data!.id, { db })

    // Mark taskA done for today
    const todayIso = new Date().toISOString().slice(0, 10)
    await markRecurringDone(taskA.id, todayIso, { db })

    const result = await listTodayRecurring({ db })

    expect(result).toHaveLength(1)
    expect(result[0].title).toBe('오늘 과제')
    expect(result[0].doneAt).not.toBeNull()
  })

  it('returns doneAt=null for tasks not completed today', async () => {
    const { db } = makeDb()
    const today = todayKey()

    await createRecurringTask({ title: '안 한 것', daysOfWeek: [today] }, { db })

    const result = await listTodayRecurring({ db })
    expect(result).toHaveLength(1)
    expect(result[0].doneAt).toBeNull()
  })
})

describe('updateRecurringTask + archiveRecurringTask', () => {
  it('updates title and daysOfWeek', async () => {
    const { db } = makeDb()
    const res1 = await createRecurringTask({ title: '원래', daysOfWeek: ['mon'] }, { db })
    expect(res1.ok).toBe(true)
    if (!res1.ok) return
    const id = res1.data!.id

    const res2 = await updateRecurringTask(id, { title: '수정됨', daysOfWeek: ['tue','thu'] }, { db })
    expect(res2.ok).toBe(true)

    const row = db.select().from(schema.recurringTasks).all()[0]
    expect(row.title).toBe('수정됨')
  })

  it('archiveRecurringTask sets archivedAt and excludes from listRecurringTasks', async () => {
    const { db } = makeDb()
    const r = await createRecurringTask({ title: '보관', daysOfWeek: ['fri'] }, { db })
    expect(r.ok).toBe(true)
    if (!r.ok) return

    const res = await archiveRecurringTask(r.data!.id, { db })
    expect(res.ok).toBe(true)

    const rows = await listRecurringTasks({ db })
    expect(rows).toHaveLength(0) // archived tasks are excluded
  })
})
