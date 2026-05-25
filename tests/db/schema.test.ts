import { describe, it, expect, afterAll } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { eq } from 'drizzle-orm'
import * as schema from '@/server/db/schema'

const tmp = mkdtempSync(join(tmpdir(), 'fs-test-'))
const dbPath = join(tmp, 'app.db')

function makeDb() {
  const sqlite = new Database(dbPath)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')
  const db = drizzle(sqlite, { schema })
  migrate(db, { migrationsFolder: './server/db/migrations' })
  return { db, sqlite }
}

describe('schema', () => {
  afterAll(() => { rmSync(tmp, { recursive: true, force: true }) })

  it('inserts and reads an academy with per-day schedule slots', () => {
    const { db } = makeDb()
    const [row] = db.insert(schema.academies).values({
      name: '수학학원',
      subject: 'math',
      color: '#ef4444',
      scheduleRule: {
        slots: [
          { day: 'mon', start: '16:00', end: '18:00' },
          { day: 'wed', start: '19:00', end: '21:00' },
          { day: 'fri', start: '17:00', end: '19:00' },
        ],
      },
    }).returning().all()
    expect(row.id).toBeGreaterThan(0)
    expect(row.name).toBe('수학학원')

    const fetched = db.select().from(schema.academies).where(eq(schema.academies.id, row.id)).get()
    expect(fetched?.scheduleRule?.slots).toHaveLength(3)
    expect(fetched?.scheduleRule?.slots[1]).toEqual({ day: 'wed', start: '19:00', end: '21:00' })
  })

  it('homework_items requires batch_id and academy_id FKs', () => {
    const { db } = makeDb()
    // Intentionally insert orphan FK row to assert the FK constraint fires.
    expect(() => db.insert(schema.homeworkItems).values({
      batchId: 9999, academyId: 9999, title: 'orphan',
      source: 'manual', isCommitted: false,
    }).run()).toThrow()
  })
})
