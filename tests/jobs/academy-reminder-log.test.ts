import { describe, it, expect } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import * as jobsSchema from '@/server/jobs/schema'

function makeJobsDb() {
  const path = join(mkdtempSync(join(tmpdir(), 'fs-acadlog-')), 'jobs.db')
  const sqlite = new Database(path)
  sqlite.pragma('journal_mode = WAL')
  const db = drizzle(sqlite, { schema: jobsSchema })
  migrate(db, { migrationsFolder: './server/jobs/migrations' })
  return db
}

describe('academy_reminder_log', () => {
  it('inserts a row successfully', () => {
    const db = makeJobsDb()
    db.insert(jobsSchema.academyReminderLog)
      .values({ dateIso: '2026-05-29', slotKey: '1|mon|14:00|start', sentAt: Date.now() })
      .run()
    const rows = db.select().from(jobsSchema.academyReminderLog).all()
    expect(rows).toHaveLength(1)
    expect(rows[0].slotKey).toBe('1|mon|14:00|start')
  })

  it('duplicate (date_iso, slot_key) is silently ignored with onConflictDoNothing', () => {
    const db = makeJobsDb()
    const now = Date.now()
    db.insert(jobsSchema.academyReminderLog)
      .values({ dateIso: '2026-05-29', slotKey: '1|mon|14:00|start', sentAt: now })
      .run()
    const res = db.insert(jobsSchema.academyReminderLog)
      .values({ dateIso: '2026-05-29', slotKey: '1|mon|14:00|start', sentAt: now + 1000 })
      .onConflictDoNothing()
      .run()
    expect((res as { changes?: number }).changes).toBe(0)

    const rows = db.select().from(jobsSchema.academyReminderLog).all()
    expect(rows).toHaveLength(1)
    expect(rows[0].sentAt).toBe(now)  // 첫 row가 유지됨
  })

  it('different slot_key same date is allowed (start vs end)', () => {
    const db = makeJobsDb()
    db.insert(jobsSchema.academyReminderLog)
      .values({ dateIso: '2026-05-29', slotKey: '1|mon|14:00|start', sentAt: Date.now() })
      .run()
    db.insert(jobsSchema.academyReminderLog)
      .values({ dateIso: '2026-05-29', slotKey: '1|mon|14:00|end', sentAt: Date.now() })
      .run()

    const rows = db.select().from(jobsSchema.academyReminderLog).all()
    expect(rows).toHaveLength(2)
  })

  it('same slot_key different date is allowed (자정 경계)', () => {
    const db = makeJobsDb()
    db.insert(jobsSchema.academyReminderLog)
      .values({ dateIso: '2026-05-29', slotKey: '1|mon|14:00|start', sentAt: Date.now() })
      .run()
    db.insert(jobsSchema.academyReminderLog)
      .values({ dateIso: '2026-05-30', slotKey: '1|mon|14:00|start', sentAt: Date.now() })
      .run()

    const rows = db.select().from(jobsSchema.academyReminderLog).all()
    expect(rows).toHaveLength(2)
  })

  it('throws on duplicate insert without onConflictDoNothing', () => {
    const db = makeJobsDb()
    db.insert(jobsSchema.academyReminderLog)
      .values({ dateIso: '2026-05-29', slotKey: '1|mon|14:00|start', sentAt: Date.now() })
      .run()
    expect(() => {
      db.insert(jobsSchema.academyReminderLog)
        .values({ dateIso: '2026-05-29', slotKey: '1|mon|14:00|start', sentAt: Date.now() })
        .run()
    }).toThrow()
  })
})
