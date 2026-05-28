'use server'

import { drizzle } from 'drizzle-orm/better-sqlite3'
import { eq, sql } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import * as schema from '@/server/db/schema'
import { getDb } from '@/server/db/client'
import { runBatchCleanup, CLEANUP_CONFIG, type CleanupResult } from '@/server/util/batch-cleanup'
import { logServerEvent } from '@/server/log/server-event'

type AppDb = ReturnType<typeof drizzle<typeof schema>>
type Ctx = { db?: AppDb }

export async function runManualCleanup(ctx: Ctx = {}): Promise<CleanupResult> {
  const db = ctx.db ?? getDb()
  const res = runBatchCleanup(db)
  revalidatePath('/homework/upload')
  revalidatePath('/admin/settings')
  await logServerEvent({ category: 'mutation', event: 'cleanup.manual_run', props: { archived: res.archivedBatchIds.length, photosCleaned: res.photosCleanedBatchIds.length, failedDeleted: res.deletedFailedBatchIds.length } })
  return res
}

export type CleanupStats = {
  totalBatches: number
  archivedBatches: number
  photosCleanedBatches: number
  pendingArchive: number     // committed batches 정리 후보 (모든 item done + 마지막 done 7일 전)
  pendingPhotoDelete: number // archived 90일 경과
  pendingFailedDelete: number // failed/pending/processing 7일 전
  lastRunAt: number | null   // 마지막 정리 실행 추정 시각 (ms). archivedAt/photosCleanedAt 중 최대값.
}

const MS_PER_DAY = 86_400_000

export async function getCleanupStats(ctx: Ctx = {}): Promise<CleanupStats> {
  const db = ctx.db ?? getDb()
  const now = Date.now()

  const all = db.select({
    id: schema.homeworkBatches.id,
    status: schema.homeworkBatches.status,
    archivedAt: schema.homeworkBatches.archivedAt,
    photosCleanedAt: schema.homeworkBatches.photosCleanedAt,
    capturedAt: schema.homeworkBatches.capturedAt,
  }).from(schema.homeworkBatches).all()

  // Aggregate item done state per batch
  const itemAgg = db.select({
    batchId: schema.homeworkItems.batchId,
    total: sql<number>`count(*)`.as('total'),
    doneCount: sql<number>`sum(case when ${schema.homeworkItems.doneAt} is null then 0 else 1 end)`.as('doneCount'),
    maxDone: sql<number | null>`max(${schema.homeworkItems.doneAt})`.as('maxDone'),
  }).from(schema.homeworkItems)
    .where(eq(schema.homeworkItems.isCommitted, true))
    .groupBy(schema.homeworkItems.batchId).all()
  const aggMap = new Map(itemAgg.map((r) => [r.batchId, r]))

  const archiveThreshold = now - CLEANUP_CONFIG.ARCHIVE_AFTER_DAYS * MS_PER_DAY
  const photosThreshold = now - CLEANUP_CONFIG.PHOTOS_DELETE_AFTER_DAYS * MS_PER_DAY
  const failedThreshold = now - CLEANUP_CONFIG.FAILED_DELETE_AFTER_DAYS * MS_PER_DAY

  let archivedBatches = 0
  let photosCleanedBatches = 0
  let pendingArchive = 0
  let pendingPhotoDelete = 0
  let pendingFailedDelete = 0
  let lastRunAt: number | null = null

  for (const b of all) {
    if (b.photosCleanedAt) {
      photosCleanedBatches++
      const t = b.photosCleanedAt.getTime()
      if (lastRunAt === null || t > lastRunAt) lastRunAt = t
    }
    if (b.archivedAt && !b.photosCleanedAt) {
      archivedBatches++
      if (b.archivedAt.getTime() <= photosThreshold) pendingPhotoDelete++
    }
    if (b.archivedAt) {
      const t = b.archivedAt.getTime()
      if (lastRunAt === null || t > lastRunAt) lastRunAt = t
    }
    if (b.status === 'committed' && !b.archivedAt) {
      const agg = aggMap.get(b.id)
      if (agg && Number(agg.total) > 0 && Number(agg.doneCount) === Number(agg.total) && agg.maxDone != null) {
        if (Number(agg.maxDone) * 1000 <= archiveThreshold) pendingArchive++
      }
    }
    if (
      (b.status === 'failed' || b.status === 'pending' || b.status === 'processing')
      && b.capturedAt.getTime() <= failedThreshold
    ) {
      pendingFailedDelete++
    }
  }

  return {
    totalBatches: all.length,
    archivedBatches,
    photosCleanedBatches,
    pendingArchive,
    pendingPhotoDelete,
    pendingFailedDelete,
    lastRunAt,
  }
}
