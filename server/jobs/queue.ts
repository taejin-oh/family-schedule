import { drizzle } from 'drizzle-orm/better-sqlite3'
import { and, asc, eq, sql } from 'drizzle-orm'
import * as schema from './schema'
import type { JobType } from './types'

type DB = ReturnType<typeof drizzle<typeof schema>>

export async function enqueue(db: DB, type: JobType, payload: Record<string, unknown>): Promise<number> {
  const [row] = db.insert(schema.jobs).values({ type, payload }).returning({ id: schema.jobs.id }).all()
  return row.id
}

export async function claimNext(db: DB) {
  const now = new Date()
  // Atomically claim the oldest queued job
  const row = db.transaction((tx) => {
    const next = tx.select().from(schema.jobs)
      .where(eq(schema.jobs.status, 'queued'))
      .orderBy(asc(schema.jobs.id))
      .limit(1)
      .get()
    if (!next) return null
    tx.update(schema.jobs)
      .set({ status: 'running', claimedAt: now })
      .where(and(eq(schema.jobs.id, next.id), eq(schema.jobs.status, 'queued')))
      .run()
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
