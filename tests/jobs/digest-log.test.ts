import { describe, it, expect } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import * as jobsSchema from '@/server/jobs/schema'

function makeJobsDb() {
  const path = join(mkdtempSync(join(tmpdir(), 'fs-diglog-')), 'jobs.db')
  const sqlite = new Database(path)
  sqlite.pragma('journal_mode = WAL')
  const db = drizzle(sqlite, { schema: jobsSchema })
  migrate(db, { migrationsFolder: './server/jobs/migrations' })
  return db
}

describe('digest_log', () => {
  it('inserts a row successfully', () => {
    const db = makeJobsDb()
    db.insert(jobsSchema.digestLog).values({ kind: 'morning', sentAt: Date.now(), dateIso: '2026-05-25' }).run()
    const rows = db.select().from(jobsSchema.digestLog).all()
    expect(rows).toHaveLength(1)
    expect(rows[0].kind).toBe('morning')
    expect(rows[0].dateIso).toBe('2026-05-25')
  })

  it('duplicate (kind, dateIso) is silently ignored with onConflictDoNothing', () => {
    const db = makeJobsDb()
    const now = Date.now()
    db.insert(jobsSchema.digestLog).values({ kind: 'morning', sentAt: now, dateIso: '2026-05-25' }).run()
    // Second insert of same (kind, dateIso) — should NOT throw
    db.insert(jobsSchema.digestLog).values({ kind: 'morning', sentAt: now + 1000, dateIso: '2026-05-25' }).onConflictDoNothing().run()

    const rows = db.select().from(jobsSchema.digestLog).all()
    expect(rows).toHaveLength(1)
  })

  it('different kind same date is allowed', () => {
    const db = makeJobsDb()
    db.insert(jobsSchema.digestLog).values({ kind: 'morning', sentAt: Date.now(), dateIso: '2026-05-25' }).run()
    db.insert(jobsSchema.digestLog).values({ kind: 'evening', sentAt: Date.now(), dateIso: '2026-05-25' }).run()

    const rows = db.select().from(jobsSchema.digestLog).all()
    expect(rows).toHaveLength(2)
  })

  it('same kind different date is allowed', () => {
    const db = makeJobsDb()
    db.insert(jobsSchema.digestLog).values({ kind: 'morning', sentAt: Date.now(), dateIso: '2026-05-25' }).run()
    db.insert(jobsSchema.digestLog).values({ kind: 'morning', sentAt: Date.now(), dateIso: '2026-05-26' }).run()

    const rows = db.select().from(jobsSchema.digestLog).all()
    expect(rows).toHaveLength(2)
  })

  it('throws on duplicate insert without onConflictDoNothing', () => {
    const db = makeJobsDb()
    db.insert(jobsSchema.digestLog).values({ kind: 'midday', sentAt: Date.now(), dateIso: '2026-05-25' }).run()
    expect(() => {
      db.insert(jobsSchema.digestLog).values({ kind: 'midday', sentAt: Date.now(), dateIso: '2026-05-25' }).run()
    }).toThrow()
  })
})
