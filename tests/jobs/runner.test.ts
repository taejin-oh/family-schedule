import { describe, it, expect } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { eq } from 'drizzle-orm'
import * as schema from '@/server/db/schema'
import { processExtractHomework } from '@/server/jobs/runner'
import type { VisionProvider } from '@/server/llm/types'

function makeAppDb() {
  const path = join(mkdtempSync(join(tmpdir(), 'fs-runner-')), 'app.db')
  const sqlite = new Database(path)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')
  const db = drizzle(sqlite, { schema })
  migrate(db, { migrationsFolder: './server/db/migrations' })
  return db
}

const fakeProvider: VisionProvider = {
  name: 'claude',
  defaultModel: 'claude-sonnet-4-6',
  availableModels: ['claude-sonnet-4-6'],
  async extractHomework() {
    return {
      items: [
        { title: 'foo', dueDate: '2026-05-27' },
        { title: 'bar', dueDate: null },
      ],
      rawResponse: '{}',
      modelUsed: 'claude-sonnet-4-6',
    }
  },
}

describe('processExtractHomework', () => {
  it('extracts items and marks batch as ready', async () => {
    const db = makeAppDb()
    const [academy] = db.insert(schema.academies).values({
      name: 'X', subject: 'math', color: '#000',
    }).returning().all()
    const [batch] = db.insert(schema.homeworkBatches).values({
      academyId: academy.id, status: 'pending',
    }).returning().all()
    db.insert(schema.homeworkPhotos).values({
      batchId: batch.id, originalPath: '/x/a.jpg', resizedPath: '/x/a-1600.jpg',
      width: 1, height: 1, bytes: 1,
    }).run()

    await processExtractHomework(db, fakeProvider, { batchId: batch.id, model: 'claude-sonnet-4-6' })

    const updated = db.select().from(schema.homeworkBatches).where(eq(schema.homeworkBatches.id, batch.id)).get()
    expect(updated?.status).toBe('ready')
    expect(updated?.modelUsed).toBe('claude-sonnet-4-6')

    const items = db.select().from(schema.homeworkItems).where(eq(schema.homeworkItems.batchId, batch.id)).all()
    expect(items).toHaveLength(2)
    expect(items[0].isCommitted).toBe(false)
    expect(items[0].source).toBe('ai')
  })

  it('marks batch failed when provider throws', async () => {
    const db = makeAppDb()
    const [academy] = db.insert(schema.academies).values({
      name: 'X', subject: 'math', color: '#000',
    }).returning().all()
    const [batch] = db.insert(schema.homeworkBatches).values({
      academyId: academy.id, status: 'pending',
    }).returning().all()
    db.insert(schema.homeworkPhotos).values({
      batchId: batch.id, originalPath: '/x/a.jpg', resizedPath: '/x/a-1600.jpg',
      width: 1, height: 1, bytes: 1,
    }).run()

    const broken: VisionProvider = { ...fakeProvider, extractHomework: async () => { throw new Error('boom') } }
    await expect(processExtractHomework(db, broken, { batchId: batch.id })).rejects.toThrow('boom')

    const updated = db.select().from(schema.homeworkBatches).where(eq(schema.homeworkBatches.id, batch.id)).get()
    expect(updated?.status).toBe('failed')
    expect(updated?.failureReason).toContain('boom')
  })

  it('saves confidence and maps sourcePhotoIndex to sourcePhotoId', async () => {
    const db = makeAppDb()
    const [academy] = db.insert(schema.academies).values({
      name: 'X', subject: 'math', color: '#000',
    }).returning().all()
    const [batch] = db.insert(schema.homeworkBatches).values({
      academyId: academy.id, status: 'pending',
    }).returning().all()
    const [photo0] = db.insert(schema.homeworkPhotos).values({
      batchId: batch.id, originalPath: '/x/a.jpg', resizedPath: '/x/a-1600.jpg',
      width: 1, height: 1, bytes: 1,
    }).returning().all()
    const [photo1] = db.insert(schema.homeworkPhotos).values({
      batchId: batch.id, originalPath: '/x/b.jpg', resizedPath: '/x/b-1600.jpg',
      width: 1, height: 1, bytes: 1,
    }).returning().all()

    const providerWithMeta: VisionProvider = {
      ...fakeProvider,
      async extractHomework() {
        return {
          items: [
            { title: 'foo', dueDate: '2026-05-27', confidence: 0.95, sourcePhotoIndex: 1 },
            { title: 'bar', dueDate: null, confidence: 0.3, sourcePhotoIndex: 0 },
          ],
          rawResponse: '{}',
          modelUsed: 'claude-sonnet-4-6',
        }
      },
    }

    await processExtractHomework(db, providerWithMeta, { batchId: batch.id })

    const items = db.select().from(schema.homeworkItems).where(eq(schema.homeworkItems.batchId, batch.id)).all()
    expect(items).toHaveLength(2)
    const foo = items.find((i) => i.title === 'foo')!
    expect(foo.confidence).toBe(0.95)
    expect(foo.sourcePhotoId).toBe(photo1.id)
    const bar = items.find((i) => i.title === 'bar')!
    expect(bar.confidence).toBe(0.3)
    expect(bar.sourcePhotoId).toBe(photo0.id)
  })

  it('sets sourcePhotoId to null when sourcePhotoIndex is out of range', async () => {
    const db = makeAppDb()
    const [academy] = db.insert(schema.academies).values({
      name: 'X', subject: 'math', color: '#000',
    }).returning().all()
    const [batch] = db.insert(schema.homeworkBatches).values({
      academyId: academy.id, status: 'pending',
    }).returning().all()
    db.insert(schema.homeworkPhotos).values({
      batchId: batch.id, originalPath: '/x/a.jpg', resizedPath: '/x/a-1600.jpg',
      width: 1, height: 1, bytes: 1,
    }).run()

    const providerOutOfRange: VisionProvider = {
      ...fakeProvider,
      async extractHomework() {
        return {
          items: [
            { title: 'foo', dueDate: null, confidence: 0.8, sourcePhotoIndex: 99 },
          ],
          rawResponse: '{}',
          modelUsed: 'claude-sonnet-4-6',
        }
      },
    }

    await processExtractHomework(db, providerOutOfRange, { batchId: batch.id })

    const items = db.select().from(schema.homeworkItems).where(eq(schema.homeworkItems.batchId, batch.id)).all()
    expect(items).toHaveLength(1)
    expect(items[0].sourcePhotoId).toBeNull()
    expect(items[0].confidence).toBe(0.8)
  })

  it('skips items already committed in the same academy (by normalized title + dueDate)', async () => {
    const db = makeAppDb()
    const [academy] = db.insert(schema.academies).values({
      name: 'X', subject: 'math', color: '#000',
    }).returning().all()

    // Seed an existing committed item that matches "foo" with dueDate '2026-05-27'
    const [seedBatch] = db.insert(schema.homeworkBatches).values({
      academyId: academy.id, status: 'committed',
    }).returning().all()
    db.insert(schema.homeworkItems).values({
      batchId: seedBatch.id, academyId: academy.id,
      title: 'FOO',                // case difference — normalization should match
      source: 'ai', isCommitted: true,
      dueDate: '2026-05-27',
    }).run()

    // Now run a new extraction that returns the same "foo" + a new "bar"
    const [newBatch] = db.insert(schema.homeworkBatches).values({
      academyId: academy.id, status: 'pending',
    }).returning().all()
    db.insert(schema.homeworkPhotos).values({
      batchId: newBatch.id, originalPath: '/x/a.jpg', resizedPath: '/x/a-1600.jpg',
      width: 1, height: 1, bytes: 1,
    }).run()

    await processExtractHomework(db, fakeProvider, { batchId: newBatch.id })

    // Only "bar" should be inserted into the new batch; "foo" deduped.
    const newItems = db.select().from(schema.homeworkItems).where(eq(schema.homeworkItems.batchId, newBatch.id)).all()
    expect(newItems.map((it) => it.title)).toEqual(['bar'])
  })
})
