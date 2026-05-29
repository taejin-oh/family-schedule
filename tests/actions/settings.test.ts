import { describe, it, expect } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import * as schema from '@/server/db/schema'
import { getSettings, updateSettings } from '@/server/actions/settings'

function makeDb() {
  const path = join(mkdtempSync(join(tmpdir(), 'fs-set-')), 'app.db')
  const sqlite = new Database(path); sqlite.pragma('foreign_keys = ON')
  const db = drizzle(sqlite, { schema })
  migrate(db, { migrationsFolder: './server/db/migrations' })
  db.insert(schema.appSettings).values({ id: 1 }).onConflictDoNothing().run()
  return db
}

describe('settings', () => {
  it('getSettings returns defaults', async () => {
    const db = makeDb()
    const s = await getSettings({ appDb: db })
    expect(s.visionProvider).toBe('claude')
    expect(s.visionModel).toBe('claude-opus-4-8')
  })

  it('updateSettings persists provider+model', async () => {
    const db = makeDb()
    const res = await updateSettings({ visionProvider: 'claude', visionModel: 'claude-opus-4-8' }, { appDb: db })
    expect(res.ok).toBe(true)
    const s = await getSettings({ appDb: db })
    expect(s.visionModel).toBe('claude-opus-4-8')
  })

  it('updateSettings rejects unknown provider', async () => {
    const db = makeDb()
    const res = await updateSettings({ visionProvider: 'xyz', visionModel: 'claude-opus-4-8' }, { appDb: db })
    expect(res.ok).toBe(false)
  })

  it('updateSettings persists telegram fields (round-trip)', async () => {
    const db = makeDb()
    const res = await updateSettings({
      visionProvider: 'claude',
      visionModel: 'claude-opus-4-8',
      telegramEnabled: true,
      telegramMorningEnabled: false,
      telegramMorningTime: '08:30',
      telegramEveningEnabled: true,
      telegramEveningTime: '22:00',
      telegramMiddayEnabled: false,
      telegramMiddayTime: '13:00',
    }, { appDb: db })
    expect(res.ok).toBe(true)
    const s = await getSettings({ appDb: db })
    expect(s.telegramEnabled).toBe(true)
    expect(s.telegramMorningEnabled).toBe(false)
    expect(s.telegramMorningTime).toBe('08:30')
    expect(s.telegramEveningEnabled).toBe(true)
    expect(s.telegramEveningTime).toBe('22:00')
    expect(s.telegramMiddayEnabled).toBe(false)
    expect(s.telegramMiddayTime).toBe('13:00')
  })

  it('updateSettings rejects invalid telegramMorningTime format (25:00)', async () => {
    const db = makeDb()
    const res = await updateSettings({
      visionProvider: 'claude',
      visionModel: 'claude-opus-4-8',
      telegramMorningTime: '25:00',
    }, { appDb: db })
    expect(res.ok).toBe(false)
    if (res.ok) throw new Error('expected failure')
    expect(res.error).toMatch(/HH:MM|범위|format/)
  })

  it('updateSettings rejects invalid minute (07:60)', async () => {
    const db = makeDb()
    const res = await updateSettings({
      visionProvider: 'claude',
      visionModel: 'claude-opus-4-8',
      telegramMorningTime: '07:60',
    }, { appDb: db })
    expect(res.ok).toBe(false)
  })

  it('updateSettings accepts boundary times (00:00, 23:59)', async () => {
    const db = makeDb()
    const a = await updateSettings({
      visionProvider: 'claude', visionModel: 'claude-opus-4-8', telegramMorningTime: '00:00',
    }, { appDb: db })
    const b = await updateSettings({
      visionProvider: 'claude', visionModel: 'claude-opus-4-8', telegramEveningTime: '23:59',
    }, { appDb: db })
    expect(a.ok).toBe(true)
    expect(b.ok).toBe(true)
  })
})
