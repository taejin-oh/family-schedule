import { describe, it, expect } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { eq } from 'drizzle-orm'
import * as schema from '@/server/db/schema'
import {
  createAcademy,
  archiveAcademy,
  unarchiveAcademy,
  listAcademies,
  listArchivedAcademies,
  deleteAcademyPermanently,
} from '@/server/actions/academies'

function makeDb() {
  const dir = mkdtempSync(join(tmpdir(), 'fs-cascade-'))
  const sqlite = new Database(join(dir, 'app.db'))
  sqlite.pragma('foreign_keys = ON')
  const db = drizzle(sqlite, { schema })
  migrate(db, { migrationsFolder: './server/db/migrations' })
  return db
}

async function newAcademy(db: ReturnType<typeof makeDb>, name = 'A') {
  const res = await createAcademy({ name, subject: 'math', color: '#000000', scheduleRule: null, location: null, notes: null }, { db })
  if (!res.ok) throw new Error(res.error)
  return res.data!.id
}

describe('archive → listArchived → unarchive cycle', () => {
  it('archived academy disappears from listAcademies and appears in listArchivedAcademies', async () => {
    const db = makeDb()
    const id = await newAcademy(db)
    await archiveAcademy(id, { db })
    const active = await listAcademies({ db })
    expect(active.map((a) => a.id)).not.toContain(id)
    const archived = await listArchivedAcademies({ db })
    expect(archived.map((a) => a.id)).toContain(id)
  })

  it('unarchived academy reappears in listAcademies and disappears from listArchivedAcademies', async () => {
    const db = makeDb()
    const id = await newAcademy(db)
    await archiveAcademy(id, { db })
    await unarchiveAcademy(id, { db })
    const active = await listAcademies({ db })
    expect(active.map((a) => a.id)).toContain(id)
    const archived = await listArchivedAcademies({ db })
    expect(archived.map((a) => a.id)).not.toContain(id)
  })
})

describe('deleteAcademyPermanently', () => {
  it('deletes the academy row', async () => {
    const db = makeDb()
    const id = await newAcademy(db)
    const res = await deleteAcademyPermanently(id, { db })
    expect(res.ok).toBe(true)
    const row = db.select().from(schema.academies).where(eq(schema.academies.id, id)).get()
    expect(row).toBeUndefined()
  })

  it('cascade deletes batches, items, and photos', async () => {
    const db = makeDb()
    const id = await newAcademy(db)

    // insert batch → item + photo (FK cascade)
    const [batch] = db.insert(schema.homeworkBatches).values({ academyId: id, status: 'committed' }).returning().all()
    db.insert(schema.homeworkPhotos).values({ batchId: batch.id, originalPath: '/p/x.jpg', resizedPath: '/p/x-r.jpg', width: 100, height: 100, bytes: 100 }).run()
    db.insert(schema.homeworkItems).values({ batchId: batch.id, academyId: id, title: '숙제', source: 'ai', isCommitted: true, dueDate: null }).run()

    const res = await deleteAcademyPermanently(id, { db })
    expect(res.ok).toBe(true)

    const batches = db.select().from(schema.homeworkBatches).where(eq(schema.homeworkBatches.academyId, id)).all()
    expect(batches).toHaveLength(0)
    const items = db.select().from(schema.homeworkItems).all()
    expect(items).toHaveLength(0)
    const photos = db.select().from(schema.homeworkPhotos).all()
    expect(photos).toHaveLength(0)
  })

  it('removes entry from listArchivedAcademies after permanent delete', async () => {
    const db = makeDb()
    const id = await newAcademy(db)
    await archiveAcademy(id, { db })
    await deleteAcademyPermanently(id, { db })
    const archived = await listArchivedAcademies({ db })
    expect(archived.map((a) => a.id)).not.toContain(id)
  })

  it('deletes a non-archived academy without error (no archive-status check in code)', async () => {
    // NOTE: deleteAcademyPermanently does NOT require the academy to be archived first.
    // This test documents the current behavior.
    const db = makeDb()
    const id = await newAcademy(db)
    // not archived
    const res = await deleteAcademyPermanently(id, { db })
    expect(res.ok).toBe(true)
    const row = db.select().from(schema.academies).where(eq(schema.academies.id, id)).get()
    expect(row).toBeUndefined()
  })
})
