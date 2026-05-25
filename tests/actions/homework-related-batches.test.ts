import { describe, it, expect } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import * as appSchema from '@/server/db/schema'
import { listRelatedBatches } from '@/server/actions/homework'

function makeDb() {
  const dir = mkdtempSync(join(tmpdir(), 'fs-related-'))
  const sqlite = new Database(join(dir, 'app.db'))
  sqlite.pragma('foreign_keys = ON')
  const appDb = drizzle(sqlite, { schema: appSchema })
  migrate(appDb, { migrationsFolder: './server/db/migrations' })
  return appDb
}

describe('listRelatedBatches', () => {
  it('returns only batches that share at least one originalPath', async () => {
    const appDb = makeDb()
    const [academy] = appDb.insert(appSchema.academies).values({ name: 'A', subject: 'math', color: '#000000' }).returning().all()

    // batch1 and batch2 share /shared/photo.jpg
    const [b1] = appDb.insert(appSchema.homeworkBatches).values({ academyId: academy.id, status: 'ready' }).returning().all()
    const [b2] = appDb.insert(appSchema.homeworkBatches).values({ academyId: academy.id, status: 'committed' }).returning().all()
    // batch3 has a completely different photo
    const [b3] = appDb.insert(appSchema.homeworkBatches).values({ academyId: academy.id, status: 'ready' }).returning().all()

    appDb.insert(appSchema.homeworkPhotos).values({ batchId: b1.id, originalPath: '/shared/photo.jpg', resizedPath: '/shared/photo-r.jpg', width: 800, height: 600, bytes: 1000 }).run()
    appDb.insert(appSchema.homeworkPhotos).values({ batchId: b2.id, originalPath: '/shared/photo.jpg', resizedPath: '/shared/photo-r.jpg', width: 800, height: 600, bytes: 1000 }).run()
    appDb.insert(appSchema.homeworkPhotos).values({ batchId: b3.id, originalPath: '/unrelated/other.jpg', resizedPath: '/unrelated/other-r.jpg', width: 400, height: 300, bytes: 500 }).run()

    const related = await listRelatedBatches(b1.id, { appDb })
    const ids = related.map((r) => r.id)
    // b1 and b2 share the file; b3 does not
    expect(ids).toContain(b1.id)
    expect(ids).toContain(b2.id)
    expect(ids).not.toContain(b3.id)
  })

  it('includes the query batch itself in results', async () => {
    const appDb = makeDb()
    const [academy] = appDb.insert(appSchema.academies).values({ name: 'A', subject: 'math', color: '#000000' }).returning().all()
    const [b] = appDb.insert(appSchema.homeworkBatches).values({ academyId: academy.id, status: 'ready' }).returning().all()
    appDb.insert(appSchema.homeworkPhotos).values({ batchId: b.id, originalPath: '/solo/img.jpg', resizedPath: '/solo/img-r.jpg', width: 100, height: 100, bytes: 99 }).run()

    const related = await listRelatedBatches(b.id, { appDb })
    expect(related.map((r) => r.id)).toContain(b.id)
  })

  it('returns empty array when the batch has no photos', async () => {
    const appDb = makeDb()
    const [academy] = appDb.insert(appSchema.academies).values({ name: 'A', subject: 'math', color: '#000000' }).returning().all()
    const [b] = appDb.insert(appSchema.homeworkBatches).values({ academyId: academy.id, status: 'ready' }).returning().all()
    // no photo rows inserted
    const related = await listRelatedBatches(b.id, { appDb })
    expect(related).toEqual([])
  })

  it('includes itemCount in each result', async () => {
    const appDb = makeDb()
    const [academy] = appDb.insert(appSchema.academies).values({ name: 'A', subject: 'math', color: '#000000' }).returning().all()
    const [b] = appDb.insert(appSchema.homeworkBatches).values({ academyId: academy.id, status: 'committed' }).returning().all()
    appDb.insert(appSchema.homeworkPhotos).values({ batchId: b.id, originalPath: '/p/x.jpg', resizedPath: '/p/x-r.jpg', width: 100, height: 100, bytes: 99 }).run()
    appDb.insert(appSchema.homeworkItems).values([
      { batchId: b.id, academyId: academy.id, title: 'a', source: 'ai', isCommitted: true, dueDate: null },
      { batchId: b.id, academyId: academy.id, title: 'b', source: 'ai', isCommitted: true, dueDate: null },
    ]).run()

    const related = await listRelatedBatches(b.id, { appDb })
    const entry = related.find((r) => r.id === b.id)
    expect(entry?.itemCount).toBe(2)
  })

  it('does not include unrelated batches when multiple batches exist', async () => {
    const appDb = makeDb()
    const [academy] = appDb.insert(appSchema.academies).values({ name: 'A', subject: 'math', color: '#000000' }).returning().all()
    const [b1] = appDb.insert(appSchema.homeworkBatches).values({ academyId: academy.id, status: 'ready' }).returning().all()
    const [b2] = appDb.insert(appSchema.homeworkBatches).values({ academyId: academy.id, status: 'ready' }).returning().all()
    appDb.insert(appSchema.homeworkPhotos).values({ batchId: b1.id, originalPath: '/img/a.jpg', resizedPath: '/img/a-r.jpg', width: 100, height: 100, bytes: 100 }).run()
    appDb.insert(appSchema.homeworkPhotos).values({ batchId: b2.id, originalPath: '/img/b.jpg', resizedPath: '/img/b-r.jpg', width: 100, height: 100, bytes: 100 }).run()

    const related = await listRelatedBatches(b1.id, { appDb })
    const ids = related.map((r) => r.id)
    expect(ids).toContain(b1.id)
    expect(ids).not.toContain(b2.id)
  })
})
