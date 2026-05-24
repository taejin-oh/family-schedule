import { describe, it, expect } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import * as schema from '@/server/db/schema'
import { getAcademyDetail } from '@/server/actions/academy-detail'

function makeDb() {
  const path = join(mkdtempSync(join(tmpdir(), 'fs-ad-')), 'app.db')
  const sqlite = new Database(path); sqlite.pragma('foreign_keys = ON')
  const db = drizzle(sqlite, { schema })
  migrate(db, { migrationsFolder: './server/db/migrations' })
  return db
}

describe('getAcademyDetail', () => {
  it('returns null for missing academy', async () => {
    const db = makeDb()
    const res = await getAcademyDetail(9999, { appDb: db })
    expect(res).toBeNull()
  })

  it('returns null for archived academy (hidden from detail)', async () => {
    const db = makeDb()
    const [a] = db.insert(schema.academies).values({
      name: 'OLD', subject: 'math', color: '#000000',
      archivedAt: new Date(),
    }).returning().all()
    const res = await getAcademyDetail(a.id, { appDb: db })
    expect(res).toBeNull()
  })

  it('splits items into active vs done', async () => {
    const db = makeDb()
    const [a] = db.insert(schema.academies).values({ name: 'X', subject: 'math', color: '#000000' }).returning().all()
    const [b] = db.insert(schema.homeworkBatches).values({ academyId: a.id, status: 'committed' }).returning().all()
    db.insert(schema.homeworkItems).values([
      { batchId: b.id, academyId: a.id, title: 'active1', source: 'ai', isCommitted: true, dueDate: '2026-06-01' },
      { batchId: b.id, academyId: a.id, title: 'done1',   source: 'ai', isCommitted: true, dueDate: null, doneAt: new Date() },
      { batchId: b.id, academyId: a.id, title: 'draft',   source: 'ai', isCommitted: false, dueDate: null },
    ]).run()
    const res = await getAcademyDetail(a.id, { appDb: db })
    expect(res?.active.map((x) => x.title)).toEqual(['active1'])
    expect(res?.done.map((x) => x.title)).toEqual(['done1'])
  })

  it('returns batches with photo & item counts, newest first', async () => {
    const db = makeDb()
    const [a] = db.insert(schema.academies).values({ name: 'X', subject: 'math', color: '#000000' }).returning().all()
    const olderDate = new Date(Date.now() - 86_400_000)
    const [b1] = db.insert(schema.homeworkBatches).values({ academyId: a.id, status: 'committed', capturedAt: olderDate }).returning().all()
    const [b2] = db.insert(schema.homeworkBatches).values({ academyId: a.id, status: 'failed' }).returning().all()
    db.insert(schema.homeworkPhotos).values([
      { batchId: b1.id, originalPath: '/x/a.jpg', resizedPath: '/x/a.jpg', width: 1, height: 1, bytes: 1 },
      { batchId: b1.id, originalPath: '/x/b.jpg', resizedPath: '/x/b.jpg', width: 1, height: 1, bytes: 1 },
      { batchId: b2.id, originalPath: '/x/c.pdf', resizedPath: '/x/c.pdf', width: 0, height: 0, bytes: 1 },
    ]).run()
    db.insert(schema.homeworkItems).values([
      { batchId: b1.id, academyId: a.id, title: 't1', source: 'ai', isCommitted: true, dueDate: null },
      { batchId: b1.id, academyId: a.id, title: 't2', source: 'ai', isCommitted: true, dueDate: null },
    ]).run()
    const res = await getAcademyDetail(a.id, { appDb: db })
    expect(res?.batches[0].id).toBe(b2.id) // newest first
    expect(res?.batches[0].photoCount).toBe(1)
    expect(res?.batches[1].photoCount).toBe(2)
    expect(res?.batches[1].itemCount).toBe(2)
  })
})
