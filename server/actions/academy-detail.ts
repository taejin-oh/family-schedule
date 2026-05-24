'use server'

import { drizzle } from 'drizzle-orm/better-sqlite3'
import { eq, desc, sql } from 'drizzle-orm'
import * as appSchema from '@/server/db/schema'
import { getDb } from '@/server/db/client'

type AppDb = ReturnType<typeof drizzle<typeof appSchema>>
type Ctx = { appDb?: AppDb }

export async function getAcademyDetail(academyId: number, ctx: Ctx = {}) {
  const appDb = ctx.appDb ?? getDb()

  const academy = appDb.select().from(appSchema.academies).where(eq(appSchema.academies.id, academyId)).get()
  if (!academy) return null
  // Archived academies are not viewable as a detail page (treat like not-found).
  if (academy.archivedAt !== null) return null

  // All items for this academy (any batch state)
  const items = appDb.select().from(appSchema.homeworkItems)
    .where(eq(appSchema.homeworkItems.academyId, academyId))
    .orderBy(desc(appSchema.homeworkItems.createdAt))
    .all()

  // Recent batches for this academy, with photo + item counts
  const batches = appDb.select().from(appSchema.homeworkBatches)
    .where(eq(appSchema.homeworkBatches.academyId, academyId))
    .orderBy(desc(appSchema.homeworkBatches.capturedAt))
    .limit(10)
    .all()

  // Photo counts per batch (one query)
  const photoCounts = appDb.select({
    batchId: appSchema.homeworkPhotos.batchId,
    cnt: sql<number>`count(*)`.as('cnt'),
  }).from(appSchema.homeworkPhotos).groupBy(appSchema.homeworkPhotos.batchId).all()
  const photoMap = new Map(photoCounts.map((c) => [c.batchId, Number(c.cnt)]))

  const itemCounts = appDb.select({
    batchId: appSchema.homeworkItems.batchId,
    cnt: sql<number>`count(*)`.as('cnt'),
  }).from(appSchema.homeworkItems).groupBy(appSchema.homeworkItems.batchId).all()
  const itemMap = new Map(itemCounts.map((c) => [c.batchId, Number(c.cnt)]))

  const enrichedBatches = batches.map((b) => ({
    ...b,
    photoCount: photoMap.get(b.id) ?? 0,
    itemCount: itemMap.get(b.id) ?? 0,
  }))

  const active = items.filter((it) => it.isCommitted && it.doneAt === null)
  const done = items.filter((it) => it.isCommitted && it.doneAt !== null)

  return { academy, active, done, batches: enrichedBatches }
}
