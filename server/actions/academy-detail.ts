'use server'

import { drizzle } from 'drizzle-orm/better-sqlite3'
import { eq, and, desc, sql, inArray } from 'drizzle-orm'
import { existsSync, unlinkSync, rmSync } from 'node:fs'
import { dirname } from 'node:path'
import { revalidatePath } from 'next/cache'
import * as appSchema from '@/server/db/schema'
import { getDb } from '@/server/db/client'
import { logServerEvent } from '@/server/log/server-event'

type AppDb = ReturnType<typeof drizzle<typeof appSchema>>
type Ctx = { appDb?: AppDb }

export async function getAcademyDetail(academyId: number, ctx: Ctx = {}) {
  const appDb = ctx.appDb ?? getDb()

  const academy = appDb.select().from(appSchema.academies).where(eq(appSchema.academies.id, academyId)).get()
  if (!academy) return null
  // Archived academies are not viewable as a detail page (treat like not-found).
  if (academy.archivedAt !== null) return null

  // committed item만 SQL-side로 filter. draft까지 transfer 안 함.
  // 학년 누적될수록 transfer/JS filter 부담 ↓.
  const items = appDb.select().from(appSchema.homeworkItems)
    .where(and(
      eq(appSchema.homeworkItems.academyId, academyId),
      eq(appSchema.homeworkItems.isCommitted, true),
    ))
    .orderBy(desc(appSchema.homeworkItems.createdAt))
    .all()

  // Recent batches for this academy, with photo + item counts
  const batches = appDb.select().from(appSchema.homeworkBatches)
    .where(eq(appSchema.homeworkBatches.academyId, academyId))
    .orderBy(desc(appSchema.homeworkBatches.capturedAt))
    .limit(10)
    .all()

  // Photo / item counts scoped to the 10 batches we return (vs full-table scan).
  const batchIds = batches.map((b) => b.id)
  const photoCounts = batchIds.length === 0 ? [] : appDb.select({
    batchId: appSchema.homeworkPhotos.batchId,
    cnt: sql<number>`count(*)`.as('cnt'),
  }).from(appSchema.homeworkPhotos)
    .where(inArray(appSchema.homeworkPhotos.batchId, batchIds))
    .groupBy(appSchema.homeworkPhotos.batchId).all()
  const photoMap = new Map(photoCounts.map((c) => [c.batchId, Number(c.cnt)]))

  const itemCounts = batchIds.length === 0 ? [] : appDb.select({
    batchId: appSchema.homeworkItems.batchId,
    cnt: sql<number>`count(*)`.as('cnt'),
  }).from(appSchema.homeworkItems)
    .where(inArray(appSchema.homeworkItems.batchId, batchIds))
    .groupBy(appSchema.homeworkItems.batchId).all()
  const itemMap = new Map(itemCounts.map((c) => [c.batchId, Number(c.cnt)]))

  const enrichedBatches = batches.map((b) => ({
    ...b,
    photoCount: photoMap.get(b.id) ?? 0,
    itemCount: itemMap.get(b.id) ?? 0,
  }))

  // items가 이미 SQL-side에서 isCommitted=true filter됨 — JS 측은 doneAt만 분기.
  const active = items.filter((it) => it.doneAt === null)
  const done = items.filter((it) => it.doneAt !== null)

  return { academy, active, done, batches: enrichedBatches }
}

/**
 * 학원 단위 사용자 롤백: 한 업로드 배치를 통째로 삭제.
 * homework_items / homework_photos는 batch FK가 cascade라 자동 삭제됨.
 * photo 파일(local path)은 별도로 unlink 시도 (실패해도 무시).
 * batch-cleanup의 deadBatch 처리 패턴과 동일.
 */
export async function deleteBatch(batchId: number, ctx: Ctx = {}) {
  const appDb = ctx.appDb ?? getDb()

  const batch = appDb.select({
    id: appSchema.homeworkBatches.id,
    academyId: appSchema.homeworkBatches.academyId,
  }).from(appSchema.homeworkBatches)
    .where(eq(appSchema.homeworkBatches.id, batchId))
    .get()
  if (!batch) return

  const photos = appDb.select().from(appSchema.homeworkPhotos)
    .where(eq(appSchema.homeworkPhotos.batchId, batchId))
    .all()
  for (const p of photos) {
    for (const path of [p.originalPath, p.resizedPath]) {
      try { if (existsSync(path)) unlinkSync(path) } catch { /* ignore */ }
    }
  }
  if (photos.length > 0) {
    try { rmSync(dirname(photos[0].resizedPath), { recursive: true, force: true }) } catch { /* ignore */ }
  }

  appDb.delete(appSchema.homeworkBatches)
    .where(eq(appSchema.homeworkBatches.id, batchId))
    .run()

  revalidatePath(`/academies/${batch.academyId}`)
  revalidatePath('/kids')
  revalidatePath('/')
  revalidatePath('/timetable')
  await logServerEvent({ category: 'mutation', event: 'homework.batch_delete', props: { batchId, academyId: batch.academyId, photoCount: photos.length, via: 'academy_detail' } })
}
