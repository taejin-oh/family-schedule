import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { eq } from 'drizzle-orm'
import * as jobsSchema from '@/server/jobs/schema'
import { enqueue, claimNext, markDone, markFailed, reapStaleRunningJobs } from '@/server/jobs/queue'

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

  it('reapStaleRunningJobs marks stale running jobs as failed with a stale error message and bumps attempts', async () => {
    const db = makeQueueDb()
    await enqueue(db, 'extract_homework', { batchId: 1 })
    const job = await claimNext(db)
    expect(job).not.toBeNull()

    // Manually backdate claimedAt to simulate a stale job (20 minutes ago)
    const staleTime = new Date(Date.now() - 20 * 60 * 1000)
    db.update(jobsSchema.jobs)
      .set({ claimedAt: staleTime })
      .where(eq(jobsSchema.jobs.id, job!.id))
      .run()

    const reaped = await reapStaleRunningJobs(db, 10 * 60 * 1000) // 10 min timeout
    expect(reaped).toBe(1)

    const rows = db.select().from(jobsSchema.jobs).all()
    expect(rows[0].status).toBe('failed')
    expect(rows[0].errorMessage).toMatch(/stale/)
    expect(rows[0].attempts).toBe(1)
    expect(rows[0].finishedAt).not.toBeNull()
  })

  it('reapStaleRunningJobs does NOT touch jobs that have been running for less than the timeout', async () => {
    const db = makeQueueDb()
    await enqueue(db, 'extract_homework', { batchId: 1 })
    const job = await claimNext(db)
    expect(job).not.toBeNull()
    // claimedAt is just now — well within the 10 min timeout

    const reaped = await reapStaleRunningJobs(db, 10 * 60 * 1000)
    expect(reaped).toBe(0)

    const rows = db.select().from(jobsSchema.jobs).all()
    expect(rows[0].status).toBe('running')
  })
})
