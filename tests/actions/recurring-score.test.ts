import { describe, it, expect } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { eq } from 'drizzle-orm'
import * as appSchema from '@/server/db/schema'
import { markRecurringDone, setRecurringScore } from '@/server/actions/recurring'

function makeDb() {
  const dir = mkdtempSync(join(tmpdir(), 'fs-rscore-'))
  const sqlite = new Database(join(dir, 'app.db')); sqlite.pragma('foreign_keys = ON')
  const db = drizzle(sqlite, { schema: appSchema })
  migrate(db, { migrationsFolder: './server/db/migrations' })
  return db
}

function seedDailyTask(db: ReturnType<typeof makeDb>) {
  const [task] = db.insert(appSchema.recurringTasks).values({
    title: '독서', cadence: 'daily', daysOfWeek: ['mon', 'tue', 'wed', 'thu', 'fri'],
  }).returning().all()
  return task
}

describe('setRecurringScore', () => {
  it('완료된 매일 할일에 별점 + 이유 기록', async () => {
    const db = makeDb()
    const task = seedDailyTask(db)
    await markRecurringDone(task.id, '2026-06-16', { db })
    const res = await setRecurringScore(task.id, '2026-06-16', 4, '집중 잘함', { db })
    expect(res.ok).toBe(true)
    const c = db.select().from(appSchema.recurringTaskCompletions).where(eq(appSchema.recurringTaskCompletions.taskId, task.id)).get()
    expect(c?.score).toBe(4)
    expect(c?.scoreReason).toBe('집중 잘함')
  })

  it('score=null이면 이유도 비움, 범위 밖(6)은 거부', async () => {
    const db = makeDb()
    const task = seedDailyTask(db)
    await markRecurringDone(task.id, '2026-06-16', { db })
    await setRecurringScore(task.id, '2026-06-16', 3, '보통', { db })
    await setRecurringScore(task.id, '2026-06-16', null, '남은이유', { db })
    const c = db.select().from(appSchema.recurringTaskCompletions).where(eq(appSchema.recurringTaskCompletions.taskId, task.id)).get()
    expect(c?.score).toBeNull()
    expect(c?.scoreReason).toBeNull()
    const bad = await setRecurringScore(task.id, '2026-06-16', 6, null, { db })
    expect(bad.ok).toBe(false)
  })
})
