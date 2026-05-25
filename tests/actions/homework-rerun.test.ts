import { describe, it, expect } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { eq } from 'drizzle-orm'
import * as appSchema from '@/server/db/schema'
import * as jobsSchema from '@/server/jobs/schema'
import { rerunBatch } from '@/server/actions/homework'

function makeDbs() {
  const dir = mkdtempSync(join(tmpdir(), 'fs-rerun-'))
  const appPath = join(dir, 'app.db')
  const jobsPath = join(dir, 'jobs.db')
  const appSqlite = new Database(appPath)
  appSqlite.pragma('foreign_keys = ON')
  const appDb = drizzle(appSqlite, { schema: appSchema })
  migrate(appDb, { migrationsFolder: './server/db/migrations' })
  const jobsSqlite = new Database(jobsPath)
  const jobsDb = drizzle(jobsSqlite, { schema: jobsSchema })
  migrate(jobsDb, { migrationsFolder: './server/jobs/migrations' })
  return { appDb, jobsDb }
}

function insertBatchWithPhoto(
  appDb: ReturnType<typeof makeDbs>['appDb'],
  opts: { status?: string; userHint?: string | null } = {},
) {
  const [academy] = appDb.insert(appSchema.academies).values({ name: 'A', subject: 'math', color: '#000000' }).returning().all()
  const [batch] = appDb.insert(appSchema.homeworkBatches).values({
    academyId: academy.id,
    status: (opts.status ?? 'ready') as 'pending' | 'processing' | 'ready' | 'committed' | 'failed',
    userHint: opts.userHint ?? null,
  }).returning().all()
  const [photo] = appDb.insert(appSchema.homeworkPhotos).values({
    batchId: batch.id,
    originalPath: '/storage/test/orig.jpg',
    resizedPath: '/storage/test/resized.jpg',
    width: 800,
    height: 600,
    bytes: 12345,
  }).returning().all()
  return { academy, batch, photo }
}

describe('rerunBatch', () => {
  it('creates a new batch with status=pending', async () => {
    const { appDb, jobsDb } = makeDbs()
    const { batch } = insertBatchWithPhoto(appDb)
    const res = await rerunBatch(batch.id, {}, { appDb, jobsDb })
    expect(res.ok).toBe(true)
    if (!res.ok) throw new Error(res.error)
    const newBatch = appDb.select().from(appSchema.homeworkBatches).where(eq(appSchema.homeworkBatches.id, res.data.batchId)).get()
    expect(newBatch?.status).toBe('pending')
    // new batch ID must differ from original
    expect(res.data.batchId).not.toBe(batch.id)
  })

  it('copies photo rows to the new batch (reference sharing)', async () => {
    const { appDb, jobsDb } = makeDbs()
    const { batch, photo } = insertBatchWithPhoto(appDb)
    const res = await rerunBatch(batch.id, {}, { appDb, jobsDb })
    if (!res.ok) throw new Error(res.error)
    const newPhotos = appDb.select().from(appSchema.homeworkPhotos).where(eq(appSchema.homeworkPhotos.batchId, res.data.batchId)).all()
    expect(newPhotos).toHaveLength(1)
    expect(newPhotos[0].originalPath).toBe(photo.originalPath)
    expect(newPhotos[0].resizedPath).toBe(photo.resizedPath)
    // new photo row has different id
    expect(newPhotos[0].id).not.toBe(photo.id)
  })

  it('propagates explicit userHint to new batch', async () => {
    const { appDb, jobsDb } = makeDbs()
    const { batch } = insertBatchWithPhoto(appDb, { userHint: '기존 힌트' })
    const res = await rerunBatch(batch.id, { userHint: '새 힌트' }, { appDb, jobsDb })
    if (!res.ok) throw new Error(res.error)
    const newBatch = appDb.select().from(appSchema.homeworkBatches).where(eq(appSchema.homeworkBatches.id, res.data.batchId)).get()
    expect(newBatch?.userHint).toBe('새 힌트')
  })

  it('falls back to original userHint when opts.userHint is undefined', async () => {
    const { appDb, jobsDb } = makeDbs()
    const { batch } = insertBatchWithPhoto(appDb, { userHint: '원본 힌트' })
    // pass no userHint key → opts.userHint is undefined → fall back to original
    const res = await rerunBatch(batch.id, {}, { appDb, jobsDb })
    if (!res.ok) throw new Error(res.error)
    const newBatch = appDb.select().from(appSchema.homeworkBatches).where(eq(appSchema.homeworkBatches.id, res.data.batchId)).get()
    expect(newBatch?.userHint).toBe('원본 힌트')
  })

  it('returns error for non-existent batchId', async () => {
    const { appDb, jobsDb } = makeDbs()
    const res = await rerunBatch(9999, {}, { appDb, jobsDb })
    expect(res.ok).toBe(false)
  })

  it('returns error when original batch has no photos', async () => {
    const { appDb, jobsDb } = makeDbs()
    const [academy] = appDb.insert(appSchema.academies).values({ name: 'A', subject: 'math', color: '#000000' }).returning().all()
    const [batch] = appDb.insert(appSchema.homeworkBatches).values({ academyId: academy.id, status: 'ready' }).returning().all()
    // intentionally no photo rows
    const res = await rerunBatch(batch.id, {}, { appDb, jobsDb })
    expect(res.ok).toBe(false)
  })

  it('allows rerun of a committed batch', async () => {
    const { appDb, jobsDb } = makeDbs()
    const { batch } = insertBatchWithPhoto(appDb, { status: 'committed' })
    const res = await rerunBatch(batch.id, {}, { appDb, jobsDb })
    expect(res.ok).toBe(true)
    if (!res.ok) throw new Error(res.error)
    const newBatch = appDb.select().from(appSchema.homeworkBatches).where(eq(appSchema.homeworkBatches.id, res.data.batchId)).get()
    expect(newBatch?.status).toBe('pending')
  })

  it('enqueues an extract_homework job for the new batch', async () => {
    const { appDb, jobsDb } = makeDbs()
    const { batch } = insertBatchWithPhoto(appDb)
    const res = await rerunBatch(batch.id, {}, { appDb, jobsDb })
    if (!res.ok) throw new Error(res.error)
    const jobs = jobsDb.select().from(jobsSchema.jobs).all()
    expect(jobs).toHaveLength(1)
    expect(jobs[0].payload).toEqual({ batchId: res.data.batchId })
  })
})
