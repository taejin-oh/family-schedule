import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import * as jobsSchema from '@/server/jobs/schema'
import { enqueue, claimNext, markDone, markFailed } from '@/server/jobs/queue'

function makeQueueDb() {
  const path = join(mkdtempSync(join(tmpdir(), 'fs-q-')), 'jobs.db')
  const sqlite = new Database(path)
  sqlite.pragma('journal_mode = WAL')
  const db = drizzle(sqlite, { schema: jobsSchema })
  migrate(db, { migrationsFolder: './server/jobs/migrations' })
  return db
}

describe('queue', () => {
  it('enqueues a job and claimNext returns it', async () => {
    const db = makeQueueDb()
    const id = await enqueue(db, 'extract_homework', { batchId: 1 })
    expect(id).toBeGreaterThan(0)

    const job = await claimNext(db)
    expect(job).not.toBeNull()
    expect(job!.id).toBe(id)
    expect(job!.payload).toEqual({ batchId: 1 })
  })

  it('claimNext returns null when no queued jobs', async () => {
    const db = makeQueueDb()
    const job = await claimNext(db)
    expect(job).toBeNull()
  })

  it('claimNext skips already-claimed jobs', async () => {
    const db = makeQueueDb()
    await enqueue(db, 'extract_homework', { batchId: 1 })
    const first = await claimNext(db)
    const second = await claimNext(db)
    expect(first).not.toBeNull()
    expect(second).toBeNull()
  })

  it('markDone sets status to done', async () => {
    const db = makeQueueDb()
    await enqueue(db, 'extract_homework', { batchId: 1 })
    const job = await claimNext(db)
    await markDone(db, job!.id)
    const again = await claimNext(db)
    expect(again).toBeNull()
  })

  it('markFailed records error and increments attempts', async () => {
    const db = makeQueueDb()
    await enqueue(db, 'extract_homework', { batchId: 1 })
    const job = await claimNext(db)
    await markFailed(db, job!.id, 'boom')
    const rows = db.select().from(jobsSchema.jobs).all()
    expect(rows[0].status).toBe('failed')
    expect(rows[0].errorMessage).toBe('boom')
    expect(rows[0].attempts).toBe(1)
  })
})
