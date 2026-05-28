import { describe, it, expect } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import * as schema from '@/server/db/schema'
import { logEvent } from '@/server/log/events'
import { runEventsCleanup, EVENTS_RETENTION_DAYS } from '@/server/util/events-cleanup'

function makeDb() {
  const dir = mkdtempSync(join(tmpdir(), 'fs-evcleanup-'))
  const sqlite = new Database(join(dir, 'app.db'))
  sqlite.pragma('foreign_keys = ON')
  const appDb = drizzle(sqlite, { schema })
  migrate(appDb, { migrationsFolder: './server/db/migrations' })
  return appDb
}

const DAY = 24 * 60 * 60 * 1000

describe('runEventsCleanup', () => {
  it('retention default is 365 days', () => {
    expect(EVENTS_RETENTION_DAYS).toBe(365)
  })

  it('deletes rows older than retention, keeps newer', () => {
    const appDb = makeDb()
    const now = new Date('2026-05-28T10:00:00').getTime()
    logEvent({ category: 'mutation', event: 'old',     ts: now - 366 * DAY }, { appDb })
    logEvent({ category: 'mutation', event: 'edge',    ts: now - 365 * DAY }, { appDb })
    logEvent({ category: 'mutation', event: 'fresh',   ts: now - 1 * DAY }, { appDb })
    logEvent({ category: 'mutation', event: 'today',   ts: now }, { appDb })

    const res = runEventsCleanup(appDb, { now })

    const remaining = appDb.select().from(schema.events).all().map((r) => r.event).sort()
    expect(remaining).toEqual(['edge', 'fresh', 'today'])
    expect(res.deleted).toBe(1)
    expect(res.cutoff).toBe('2025-05-28')
  })

  it('handles empty table without throwing', () => {
    const appDb = makeDb()
    const res = runEventsCleanup(appDb, { now: Date.now() })
    expect(res.deleted).toBe(0)
  })

  it('respects custom retentionDays', () => {
    const appDb = makeDb()
    const now = new Date('2026-05-28T10:00:00').getTime()
    logEvent({ category: 'mutation', event: 'a', ts: now - 10 * DAY }, { appDb })
    logEvent({ category: 'mutation', event: 'b', ts: now - 2 * DAY }, { appDb })

    const res = runEventsCleanup(appDb, { now, retentionDays: 7 })
    expect(res.deleted).toBe(1)
    expect(appDb.select().from(schema.events).all()[0].event).toBe('b')
  })
})
