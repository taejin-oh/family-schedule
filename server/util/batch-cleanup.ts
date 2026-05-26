import { drizzle } from 'drizzle-orm/better-sqlite3'
import { and, eq, isNull, lt, inArray, sql, isNotNull } from 'drizzle-orm'
import { unlinkSync, existsSync, rmSync } from 'node:fs'
import { dirname } from 'node:path'
import * as schema from '@/server/db/schema'

type AppDb = ReturnType<typeof drizzle<typeof schema>>

const MS_PER_DAY = 86_400_000
const ARCHIVE_AFTER_DAYS = 7      // committed + 모든 item done + 마지막 done이 N일 전
const PHOTOS_DELETE_AFTER_DAYS = 90  // archived 후 N일 → photos 삭제
const FAILED_DELETE_AFTER_DAYS = 7   // failed/pending/processing → 전체 삭제

export type BatchSummary = {
  batchId: number
  minDue: string | null     // 'YYYY-MM-DD' or null
  maxDue: string | null
  itemCount: number
}

/** Per-batch due-date range for committed items. Used for UI label like '5/26 ~ 5/30 숙제 5건'. */
export function dueRangeForBatches(db: AppDb, batchIds: number[]): Map<number, BatchSummary> {
  const out = new Map<number, BatchSummary>()
  if (batchIds.length === 0) return out
  const rows = db.select({
    batchId: schema.homeworkItems.batchId,
    min: sql<string | null>`min(${schema.homeworkItems.dueDate})`.as('min'),
    max: sql<string | null>`max(${schema.homeworkItems.dueDate})`.as('max'),
    count: sql<number>`count(*)`.as('count'),
  })
    .from(schema.homeworkItems)
    .where(inArray(schema.homeworkItems.batchId, batchIds))
    .groupBy(schema.homeworkItems.batchId)
    .all()
  for (const r of rows) {
    out.set(r.batchId, {
      batchId: r.batchId,
      minDue: r.min,
      maxDue: r.max,
      itemCount: Number(r.count),
    })
  }
  return out
}

export type CleanupResult = {
  archivedBatchIds: number[]      // committed → archived
  photosCleanedBatchIds: number[] // archived 90일 후 photos 삭제
  deletedFailedBatchIds: number[] // failed/pending/processing 전체 삭제
  deletedPhotoFiles: number
  deletedPhotoRows: number
}

/**
 * Apply cleanup rules. Safe to call multiple times (idempotent).
 *
 *  - committed batch + all items done + 최신 doneAt이 7일 이상 전 → archivedAt = now
 *  - archivedAt 이후 90일 경과 + photosCleanedAt 아직 없음 → photos 파일/row 삭제
 *  - failed/pending/processing batch가 capturedAt 7일 이상 전 → 전체(batch + photos + items cascade) 삭제
 */
export function runBatchCleanup(db: AppDb, opts?: { now?: number }): CleanupResult {
  const now = opts?.now ?? Date.now()
  const archiveThreshold = new Date(now - ARCHIVE_AFTER_DAYS * MS_PER_DAY)
  const photosDeleteThreshold = new Date(now - PHOTOS_DELETE_AFTER_DAYS * MS_PER_DAY)
  const failedDeleteThreshold = new Date(now - FAILED_DELETE_AFTER_DAYS * MS_PER_DAY)

  const result: CleanupResult = {
    archivedBatchIds: [],
    photosCleanedBatchIds: [],
    deletedFailedBatchIds: [],
    deletedPhotoFiles: 0,
    deletedPhotoRows: 0,
  }

  // === 1) Archive eligible committed batches ===
  // committed + not yet archived + every item done + max(doneAt) ≤ archiveThreshold.
  // Aggregate per batch in SQL then filter.
  const committedAgg = db.select({
    batchId: schema.homeworkItems.batchId,
    total: sql<number>`count(*)`.as('total'),
    doneCount: sql<number>`sum(case when ${schema.homeworkItems.doneAt} is null then 0 else 1 end)`.as('doneCount'),
    maxDone: sql<number | null>`max(${schema.homeworkItems.doneAt})`.as('maxDone'),
  })
    .from(schema.homeworkItems)
    .where(eq(schema.homeworkItems.isCommitted, true))
    .groupBy(schema.homeworkItems.batchId)
    .all()

  const eligibleArchive = committedAgg.filter((r) => {
    if (Number(r.total) === 0) return false
    if (Number(r.doneCount) !== Number(r.total)) return false
    if (r.maxDone == null) return false
    return Number(r.maxDone) * 1000 <= archiveThreshold.getTime()
  })

  if (eligibleArchive.length > 0) {
    const ids = eligibleArchive.map((r) => r.batchId)
    // restrict to batches that are status=committed AND archivedAt IS NULL.
    const stillCommitted = db.select({ id: schema.homeworkBatches.id })
      .from(schema.homeworkBatches)
      .where(and(
        inArray(schema.homeworkBatches.id, ids),
        eq(schema.homeworkBatches.status, 'committed'),
        isNull(schema.homeworkBatches.archivedAt),
      ))
      .all()
    const archiveIds = stillCommitted.map((r) => r.id)
    if (archiveIds.length > 0) {
      db.update(schema.homeworkBatches)
        .set({ archivedAt: new Date(now) })
        .where(inArray(schema.homeworkBatches.id, archiveIds))
        .run()
      result.archivedBatchIds = archiveIds
    }
  }

  // === 2) Delete photos for batches archived ≥ 90 days ===
  const dueForPhotoCleanup = db.select({
    id: schema.homeworkBatches.id,
  })
    .from(schema.homeworkBatches)
    .where(and(
      isNotNull(schema.homeworkBatches.archivedAt),
      lt(schema.homeworkBatches.archivedAt, photosDeleteThreshold),
      isNull(schema.homeworkBatches.photosCleanedAt),
    ))
    .all()

  for (const b of dueForPhotoCleanup) {
    const photos = db.select().from(schema.homeworkPhotos)
      .where(eq(schema.homeworkPhotos.batchId, b.id))
      .all()
    for (const p of photos) {
      for (const path of [p.originalPath, p.resizedPath]) {
        try {
          if (existsSync(path)) { unlinkSync(path); result.deletedPhotoFiles++ }
        } catch { /* ignore */ }
      }
    }
    // remove batch dir if empty (best-effort)
    if (photos.length > 0) {
      try {
        const dir = dirname(photos[0].resizedPath)
        rmSync(dir, { recursive: true, force: true })
      } catch { /* ignore */ }
    }
    if (photos.length > 0) {
      const photoIds = photos.map((p) => p.id)
      db.delete(schema.homeworkPhotos)
        .where(inArray(schema.homeworkPhotos.id, photoIds))
        .run()
      result.deletedPhotoRows += photoIds.length
    }
    db.update(schema.homeworkBatches)
      .set({ photosCleanedAt: new Date(now) })
      .where(eq(schema.homeworkBatches.id, b.id))
      .run()
    result.photosCleanedBatchIds.push(b.id)
  }

  // === 3) Delete failed / pending / processing batches older than 7 days ===
  const deadBatches = db.select({
    id: schema.homeworkBatches.id,
  })
    .from(schema.homeworkBatches)
    .where(and(
      inArray(schema.homeworkBatches.status, ['failed', 'pending', 'processing']),
      lt(schema.homeworkBatches.capturedAt, failedDeleteThreshold),
    ))
    .all()

  for (const b of deadBatches) {
    const photos = db.select().from(schema.homeworkPhotos)
      .where(eq(schema.homeworkPhotos.batchId, b.id))
      .all()
    for (const p of photos) {
      for (const path of [p.originalPath, p.resizedPath]) {
        try {
          if (existsSync(path)) { unlinkSync(path); result.deletedPhotoFiles++ }
        } catch { /* ignore */ }
      }
    }
    if (photos.length > 0) {
      try {
        const dir = dirname(photos[0].resizedPath)
        rmSync(dir, { recursive: true, force: true })
      } catch { /* ignore */ }
    }
    // FK cascade on photos + items via onDelete:'cascade'
    db.delete(schema.homeworkBatches)
      .where(eq(schema.homeworkBatches.id, b.id))
      .run()
    result.deletedFailedBatchIds.push(b.id)
  }

  return result
}

/** Constants exposed for UI/text formatting. */
export const CLEANUP_CONFIG = {
  ARCHIVE_AFTER_DAYS,
  PHOTOS_DELETE_AFTER_DAYS,
  FAILED_DELETE_AFTER_DAYS,
} as const
