import { describe, it, expect } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import * as schema from '@/server/db/schema'
import { logEvent } from '@/server/log/events'

function makeDb() {
  const dir = mkdtempSync(join(tmpdir(), 'fs-log-'))
  const sqlite = new Database(join(dir, 'app.db'))
  sqlite.pragma('foreign_keys = ON')
  const appDb = drizzle(sqlite, { schema })
  migrate(appDb, { migrationsFolder: './server/db/migrations' })
  return appDb
}

describe('logEvent', () => {
  it('inserts a row with local_date computed and props roundtrip', () => {
    const appDb = makeDb()
    logEvent({ category: 'mutation', event: 'test.create', props: { id: 1, fields: ['a', 'b'] } }, { appDb })
    const rows = appDb.select().from(schema.events).all()
    expect(rows.length).toBe(1)
    expect(rows[0].category).toBe('mutation')
    expect(rows[0].event).toBe('test.create')
    expect(rows[0].localDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(JSON.parse(rows[0].propsJson!)).toEqual({ id: 1, fields: ['a', 'b'] })
  })

  it('silently rejects unknown category (no row, no throw)', () => {
    const appDb = makeDb()
    // @ts-expect-error testing invalid category
    logEvent({ category: 'bogus', event: 'x' }, { appDb })
    expect(appDb.select().from(schema.events).all().length).toBe(0)
  })

  it('rejects empty event name', () => {
    const appDb = makeDb()
    logEvent({ category: 'mutation', event: '' }, { appDb })
    expect(appDb.select().from(schema.events).all().length).toBe(0)
  })

  it('drops props over 8KB cap (row inserted with propsJson=null)', () => {
    const appDb = makeDb()
    const huge = { big: 'x'.repeat(10000) }
    logEvent({ category: 'mutation', event: 'huge', props: huge }, { appDb })
    const rows = appDb.select().from(schema.events).all()
    expect(rows.length).toBe(1)
    expect(rows[0].propsJson).toBeNull()
  })

  it('respects ts override for local_date (Seoul TZ — date varies by env)', () => {
    const appDb = makeDb()
    const ts = new Date('2026-05-28T10:00:00').getTime()
    logEvent({ category: 'mutation', event: 'x', ts }, { appDb })
    const row = appDb.select().from(schema.events).all()[0]
    expect(row.localDate).toBe('2026-05-28')
    expect(row.ts).toBe(ts)
  })

  it('stores sessionId, path, userAgent when provided', () => {
    const appDb = makeDb()
    logEvent({ category: 'navigation', event: 'page_enter', sessionId: 'sess-1', path: '/timetable', userAgent: 'ua' }, { appDb })
    const row = appDb.select().from(schema.events).all()[0]
    expect(row.sessionId).toBe('sess-1')
    expect(row.path).toBe('/timetable')
    expect(row.userAgent).toBe('ua')
  })

  it('all allowed categories accepted', () => {
    const appDb = makeDb()
    const cats = ['navigation', 'interaction', 'mutation', 'error', 'perf', 'feature'] as const
    for (const c of cats) {
      logEvent({ category: c, event: 'x' }, { appDb })
    }
    expect(appDb.select().from(schema.events).all().length).toBe(cats.length)
  })

  it('never throws when db is broken (silent)', () => {
    const appDb = {} as never
    expect(() => logEvent({ category: 'mutation', event: 'x' }, { appDb })).not.toThrow()
  })
})
