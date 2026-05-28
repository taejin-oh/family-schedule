import { drizzle } from 'drizzle-orm/better-sqlite3'
import { lt, sql } from 'drizzle-orm'
import * as schema from '@/server/db/schema'

type AppDb = ReturnType<typeof drizzle<typeof schema>>

/**
 * Analytics events 보존 정책: 30일.
 * local_date 기준이라 day 단위 cut-off가 정확함 (epoch 변환 안 필요).
 */
export const EVENTS_RETENTION_DAYS = 30

/**
 * 30일 초과된 events 삭제. 함께 VACUUM은 안 함 (운영 중 file lock).
 * 매일 04:00 daily tick에서 호출 (worker run.ts).
 */
export function runEventsCleanup(db: AppDb, opts?: { now?: number; retentionDays?: number }): { deleted: number; cutoff: string } {
  const now = opts?.now ?? Date.now()
  const days = opts?.retentionDays ?? EVENTS_RETENTION_DAYS
  const cutoffDate = new Date(now)
  cutoffDate.setDate(cutoffDate.getDate() - days)
  const y = cutoffDate.getFullYear()
  const m = String(cutoffDate.getMonth() + 1).padStart(2, '0')
  const d = String(cutoffDate.getDate()).padStart(2, '0')
  const cutoff = `${y}-${m}-${d}`

  const before = db.select({ n: sql<number>`count(*)`.as('n') })
    .from(schema.events)
    .where(lt(schema.events.localDate, cutoff))
    .get()
  const beforeCount = before ? Number(before.n) : 0

  db.delete(schema.events).where(lt(schema.events.localDate, cutoff)).run()

  return { deleted: beforeCount, cutoff }
}
