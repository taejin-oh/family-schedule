import { describe, it, expect } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import * as schema from '@/server/db/schema'
import { createAcademy, updateAcademy, listAcademies, archiveAcademy } from '@/server/actions/academies'

function makeDb() {
  const path = join(mkdtempSync(join(tmpdir(), 'fs-act-')), 'app.db')
  const sqlite = new Database(path)
  sqlite.pragma('foreign_keys = ON')
  const db = drizzle(sqlite, { schema })
  migrate(db, { migrationsFolder: './server/db/migrations' })
  return db
}

describe('academy actions', () => {
  it('createAcademy accepts valid input', async () => {
    const db = makeDb()
    const res = await createAcademy({
      name: '수학학원', subject: 'math', color: '#ef4444',
      scheduleRule: { days: ['mon','wed','fri'], start: '19:00', end: '21:00' },
      location: null, notes: null,
    }, { db })
    expect(res.ok).toBe(true)
    expect(res.data?.id).toBeGreaterThan(0)
  })

  it('createAcademy rejects empty name', async () => {
    const db = makeDb()
    const res = await createAcademy({
      name: '', subject: 'math', color: '#ef4444', scheduleRule: null, location: null, notes: null,
    }, { db })
    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/이름|name/i)
  })

  it('listAcademies omits archived by default', async () => {
    const db = makeDb()
    const a = await createAcademy({ name: 'A', subject: 'math', color: '#000000', scheduleRule: null, location: null, notes: null }, { db })
    const b = await createAcademy({ name: 'B', subject: 'english', color: '#111111', scheduleRule: null, location: null, notes: null }, { db })
    await archiveAcademy(b.data!.id, { db })
    const list = await listAcademies({ db })
    expect(list.map((x) => x.id)).toEqual([a.data!.id])
  })

  it('updateAcademy updates name and color', async () => {
    const db = makeDb()
    const created = await createAcademy({ name: 'A', subject: 'math', color: '#000000', scheduleRule: null, location: null, notes: null }, { db })
    const res = await updateAcademy(created.data!.id, { name: 'A2', subject: 'math', color: '#ffffff', scheduleRule: null, location: null, notes: null }, { db })
    expect(res.ok).toBe(true)
    const list = await listAcademies({ db })
    expect(list[0].name).toBe('A2')
    expect(list[0].color).toBe('#ffffff')
  })
})
