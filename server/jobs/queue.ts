import { drizzle } from 'drizzle-orm/better-sqlite3'
import { and, asc, eq, lt, sql } from 'drizzle-orm'
import * as schema from './schema'
import type { JobType } from './types'

type DB = ReturnType<typeof drizzle<typeof schema>>

export async function enqueue(db: DB, type: JobType, payload: Record<string, unknown>): Promise<number> {
  const [row] = db.insert(schema.jobs).values({ type, payload }).returning({ id: schema.jobs.id }).all()
  return row.id
}

export async function claimNext(db: DB) {
  const now = new Date()
  // Atomically claim the oldest queued job. The where-clause on UPDATE
  // includes status='queued' so a second worker that loses the race will
  // see changes===0 and skip. Single-worker today, but defensive.
  const row = db.transaction((tx) => {
    const next = tx.select().from(schema.jobs)
      .where(eq(schema.jobs.status, 'queued'))
      .orderBy(asc(schema.jobs.id))
      .limit(1)
      .get()
    if (!next) return null
    const res = tx.update(schema.jobs)
      .set({ status: 'running', claimedAt: now })
      .where(and(eq(schema.jobs.id, next.id), eq(schema.jobs.status, 'queued')))
      .run()
    if (res.changes === 0) return null  // lost the race; another worker claimed it
    return next
  })
  return row
}

export async function markDone(db: DB, id: number) {
  db.update(schema.jobs)
    .set({ status: 'done', finishedAt: new Date() })
    .where(eq(schema.jobs.id, id))
    .run()
}

export async function markFailed(db: DB, id: number, message: string) {
  db.update(schema.jobs)
    .set({
      status: 'failed',
      errorMessage: message,
      finishedAt: new Date(),
      attempts: sql`${schema.jobs.attempts} + 1`,
    })
    .where(eq(schema.jobs.id, id))
    .run()
}

/**
 * Find jobs stuck in 'running' for longer than timeoutMs and reset them to 'failed'.
 * Called on worker startup and periodically (every few loops) to recover from
 * crashed workers.
 */
export async function reapStaleRunningJobs(db: DB, timeoutMs: number): Promise<number> {
  const cutoff = new Date(Date.now() - timeoutMs)
  const stale = db.select().from(schema.jobs)
    .where(and(
      eq(schema.jobs.status, 'running'),
      lt(schema.jobs.claimedAt, cutoff),
    ))
    .all()
  if (stale.length === 0) return 0
  for (const job of stale) {
    db.update(schema.jobs)
      .set({
        status: 'failed',
        errorMessage: `stale: still running ${Math.round((Date.now() - (job.claimedAt?.getTime() ?? 0)) / 60000)}m after claim — worker likely crashed`,
        finishedAt: new Date(),
        attempts: sql`${schema.jobs.attempts} + 1`,
      })
      .where(eq(schema.jobs.id, job.id))
      .run()
  }
  return stale.length
}
