import { describe, it, expect } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import * as schema from '@/server/db/schema'
import { runBatchCleanup, dueRangeForBatches } from '@/server/util/batch-cleanup'

function makeDb() {
  const dir = mkdtempSync(join(tmpdir(), 'fs-cleanup-'))
  const sqlite = new Database(join(dir, 'app.db'))
  sqlite.pragma('foreign_keys = ON')
  const db = drizzle(sqlite, { schema })
  migrate(db, { migrationsFolder: './server/db/migrations' })
  return { db, sqlite }
}

const DAY_MS = 86_400_000

async function seedAcademy(db: ReturnType<typeof makeDb>['db']) {
  const r = db.insert(schema.academies).values({
    name: 'sie2', subject: 'english', color: '#F59E0B',
  }).returning({ id: schema.academies.id }).get()
  return r!.id
}

function seedBatch(db: ReturnType<typeof makeDb>['db'], academyId: number, opts: {
  status: 'pending'|'processing'|'ready'|'committed'|'failed'
  capturedAt: Date
  archivedAt?: Date | null
  photosCleanedAt?: Date | null
}): number {
  const r = db.insert(schema.homeworkBatches).values({
    academyId,
    status: opts.status,
    capturedAt: opts.capturedAt,
    archivedAt: opts.archivedAt ?? null,
    photosCleanedAt: opts.photosCleanedAt ?? null,
  }).returning({ id: schema.homeworkBatches.id }).get()
  return r!.id
}

function seedItem(db: ReturnType<typeof makeDb>['db'], batchId: number, academyId: number, opts: {
  title: string
  isCommitted: boolean
  doneAt?: Date | null
  dueDate?: string | null
}) {
  db.insert(schema.homeworkItems).values({
    batchId, academyId,
    title: opts.title,
    source: 'ai',
    isCommitted: opts.isCommitted,
    doneAt: opts.doneAt ?? null,
    dueDate: opts.dueDate ?? null,
  }).run()
}

function seedPhoto(db: ReturnType<typeof makeDb>['db'], batchId: number, paths: { original: string; resized: string }) {
  db.insert(schema.homeworkPhotos).values({
    batchId,
    originalPath: paths.original,
    resizedPath: paths.resized,
    width: 100, height: 100, bytes: 1000,
  }).run()
}

describe('runBatchCleanup', () => {
  it('archives committed batches whose latest doneAt is older than 7 days', async () => {
    const { db } = makeDb()
    const a = await seedAcademy(db)
    const now = Date.now()
    // Eligible: all done, latest doneAt 8일 전
    const b1 = seedBatch(db, a, { status: 'committed', capturedAt: new Date(now - 30 * DAY_MS) })
    seedItem(db, b1, a, { title: 't1', isCommitted: true, doneAt: new Date(now - 10 * DAY_MS) })
    seedItem(db, b1, a, { title: 't2', isCommitted: true, doneAt: new Date(now - 8 * DAY_MS) })
    // Not eligible: one item not done
    const b2 = seedBatch(db, a, { status: 'committed', capturedAt: new Date(now - 30 * DAY_MS) })
    seedItem(db, b2, a, { title: 't3', isCommitted: true, doneAt: new Date(now - 10 * DAY_MS) })
    seedItem(db, b2, a, { title: 't4', isCommitted: true, doneAt: null })
    // Not eligible: all done but latest doneAt 5일 전
    const b3 = seedBatch(db, a, { status: 'committed', capturedAt: new Date(now - 30 * DAY_MS) })
    seedItem(db, b3, a, { title: 't5', isCommitted: true, doneAt: new Date(now - 5 * DAY_MS) })

    const res = runBatchCleanup(db, { now })
    expect(res.archivedBatchIds).toContain(b1)
    expect(res.archivedBatchIds).not.toContain(b2)
    expect(res.archivedBatchIds).not.toContain(b3)
  })

  it('does not re-archive batches that are already archived', async () => {
    const { db } = makeDb()
    const a = await seedAcademy(db)
    const now = Date.now()
    const b1 = seedBatch(db, a, {
      status: 'committed',
      capturedAt: new Date(now - 30 * DAY_MS),
      archivedAt: new Date(now - 5 * DAY_MS),
    })
    seedItem(db, b1, a, { title: 't1', isCommitted: true, doneAt: new Date(now - 10 * DAY_MS) })
    const res = runBatchCleanup(db, { now })
    expect(res.archivedBatchIds).toHaveLength(0)
  })

  it('cleans photos for batches archived ≥ 90 days', async () => {
    const { db } = makeDb()
    const a = await seedAcademy(db)
    const now = Date.now()
    const b1 = seedBatch(db, a, {
      status: 'committed',
      capturedAt: new Date(now - 200 * DAY_MS),
      archivedAt: new Date(now - 91 * DAY_MS),
    })
    seedItem(db, b1, a, { title: 't1', isCommitted: true, doneAt: new Date(now - 100 * DAY_MS) })
    seedPhoto(db, b1, { original: '/tmp/nonexistent-orig.jpg', resized: '/tmp/nonexistent-1600.jpg' })
    seedPhoto(db, b1, { original: '/tmp/nonexistent-orig-2.jpg', resized: '/tmp/nonexistent-1600-2.jpg' })

    const res = runBatchCleanup(db, { now })
    expect(res.photosCleanedBatchIds).toContain(b1)
    expect(res.deletedPhotoRows).toBe(2)
    const remaining = db.select().from(schema.homeworkPhotos).all()
    expect(remaining).toHaveLength(0)
    const batchRow = db.select().from(schema.homeworkBatches).get()
    expect(batchRow?.photosCleanedAt).not.toBeNull()
  })

  it('does not clean photos for batches archived < 90 days', async () => {
    const { db } = makeDb()
    const a = await seedAcademy(db)
    const now = Date.now()
    const b1 = seedBatch(db, a, {
      status: 'committed',
      capturedAt: new Date(now - 100 * DAY_MS),
      archivedAt: new Date(now - 89 * DAY_MS),
    })
    seedItem(db, b1, a, { title: 't1', isCommitted: true, doneAt: new Date(now - 95 * DAY_MS) })
    seedPhoto(db, b1, { original: '/tmp/nx-a.jpg', resized: '/tmp/nx-b.jpg' })
    const res = runBatchCleanup(db, { now })
    expect(res.photosCleanedBatchIds).toHaveLength(0)
    expect(db.select().from(schema.homeworkPhotos).all()).toHaveLength(1)
  })

  it('deletes failed / pending / processing batches older than 7 days entirely', async () => {
    const { db } = makeDb()
    const a = await seedAcademy(db)
    const now = Date.now()
    const failed = seedBatch(db, a, { status: 'failed', capturedAt: new Date(now - 8 * DAY_MS) })
    const pending = seedBatch(db, a, { status: 'pending', capturedAt: new Date(now - 8 * DAY_MS) })
    const processing = seedBatch(db, a, { status: 'processing', capturedAt: new Date(now - 30 * DAY_MS) })
    // Recent failed → keep
    const recent = seedBatch(db, a, { status: 'failed', capturedAt: new Date(now - 2 * DAY_MS) })
    seedPhoto(db, failed, { original: '/tmp/f1.jpg', resized: '/tmp/f1r.jpg' })

    const res = runBatchCleanup(db, { now })
    expect(res.deletedFailedBatchIds).toEqual(expect.arrayContaining([failed, pending, processing]))
    expect(res.deletedFailedBatchIds).not.toContain(recent)
    const remaining = db.select().from(schema.homeworkBatches).all()
    expect(remaining.map((r) => r.id)).toEqual([recent])
  })

  it('does not delete committed batches even if they are old', async () => {
    const { db } = makeDb()
    const a = await seedAcademy(db)
    const now = Date.now()
    const b1 = seedBatch(db, a, { status: 'committed', capturedAt: new Date(now - 100 * DAY_MS) })
    seedItem(db, b1, a, { title: 't', isCommitted: true, doneAt: null })  // 진행 중
    const res = runBatchCleanup(db, { now })
    expect(res.deletedFailedBatchIds).toHaveLength(0)
    expect(db.select().from(schema.homeworkBatches).all()).toHaveLength(1)
  })
})

describe('dueRangeForBatches', () => {
  it('returns min/max/count per batch, ignoring nulls', async () => {
    const { db } = makeDb()
    const a = await seedAcademy(db)
    const now = Date.now()
    const b1 = seedBatch(db, a, { status: 'committed', capturedAt: new Date(now) })
    seedItem(db, b1, a, { title: 't1', isCommitted: true, dueDate: '2026-05-26' })
    seedItem(db, b1, a, { title: 't2', isCommitted: true, dueDate: '2026-05-30' })
    seedItem(db, b1, a, { title: 't3', isCommitted: true, dueDate: null })
    const b2 = seedBatch(db, a, { status: 'committed', capturedAt: new Date(now) })
    seedItem(db, b2, a, { title: 't4', isCommitted: true, dueDate: '2026-05-28' })

    const map = dueRangeForBatches(db, [b1, b2])
    expect(map.get(b1)).toEqual({ batchId: b1, minDue: '2026-05-26', maxDue: '2026-05-30', itemCount: 3 })
    expect(map.get(b2)).toEqual({ batchId: b2, minDue: '2026-05-28', maxDue: '2026-05-28', itemCount: 1 })
  })

  it('returns empty map for empty input', () => {
    const { db } = makeDb()
    expect(dueRangeForBatches(db, [])).toEqual(new Map())
  })
})
