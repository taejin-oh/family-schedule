'use server'

import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { eq, desc, sql, inArray, and, isNull, gte, lt } from 'drizzle-orm'
import { z } from 'zod'
import { resolve, dirname } from 'node:path'
import { mkdirSync } from 'node:fs'
import { revalidatePath } from 'next/cache'
import * as appSchema from '@/server/db/schema'
import * as jobsSchema from '@/server/jobs/schema'
import { getDb } from '@/server/db/client'
import { enqueue } from '@/server/jobs/queue'
import { saveOriginal, makeResized } from '@/server/storage/photos'
import { localDayWindow } from '@/server/util/date'
import { tryStampToday } from '@/server/actions/stickers'

type AppDb = ReturnType<typeof drizzle<typeof appSchema>>
type JobsDb = ReturnType<typeof drizzle<typeof jobsSchema>>
type Ctx = { appDb?: AppDb; jobsDb?: JobsDb; storageRoot?: string }

let _jobsDb: JobsDb | null = null
function defaultJobsDb(): JobsDb {
  if (_jobsDb) return _jobsDb
  const path = process.env.JOBS_DB_PATH ?? resolve(process.cwd(), 'data/jobs.db')
  mkdirSync(dirname(path), { recursive: true })
  const sqlite = new Database(path)
  sqlite.pragma('journal_mode = WAL')
  _jobsDb = drizzle(sqlite, { schema: jobsSchema })
  migrate(_jobsDb, { migrationsFolder: resolve(process.cwd(), 'server/jobs/migrations') })
  return _jobsDb
}

function extFromMime(mime: string): string {
  if (mime === 'image/jpeg' || mime === 'image/jpg') return 'jpg'
  if (mime === 'image/png') return 'png'
  if (mime === 'image/webp') return 'webp'
  if (mime === 'image/heic') return 'heic'
  if (mime === 'application/pdf') return 'pdf'
  return 'bin'
}

function isResizableImage(mime: string): boolean {
  return mime.startsWith('image/') && mime !== 'image/heic'
  // heic skipped: sharp on macOS sometimes lacks libheif; pass through as-is
}

export type UploadInput = { academyId: number; files: File[]; userHint?: string | null }
export type UploadResult = { ok: true; data: { batchId: number } } | { ok: false; error: string }

const ACCEPTED_MIMES = new Set([
  'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'application/pdf',
])

/**
 * Create an empty batch for manual entry (no photos, no AI extraction).
 * Status starts at 'ready' so /review immediately accepts manual-add.
 * User fills items via the existing review-form 수동 추가 section then commits.
 */
export async function createEmptyBatch(
  academyId: number,
  ctx: Ctx = {},
): Promise<UploadResult> {
  const appDb = ctx.appDb ?? getDb()
  const academy = appDb.select().from(appSchema.academies).where(eq(appSchema.academies.id, academyId)).get()
  if (!academy) return { ok: false, error: '학원을 찾을 수 없습니다.' }
  const [batch] = appDb.insert(appSchema.homeworkBatches).values({
    academyId,
    status: 'ready',
  }).returning().all()
  revalidatePath('/')
  revalidatePath('/dashboard')
  revalidatePath('/homework/upload')
  return { ok: true, data: { batchId: batch.id } }
}

export async function uploadHomework(input: UploadInput, ctx: Ctx = {}): Promise<UploadResult> {
  if (!input.files || input.files.length === 0) return { ok: false, error: '파일을 한 장 이상 선택하세요.' }
  const bad = input.files.find((f) => !ACCEPTED_MIMES.has(f.type))
  if (bad) return { ok: false, error: `지원하지 않는 파일 형식: ${bad.type || bad.name}. 이미지(JPG/PNG/WEBP/HEIC) 또는 PDF만 가능합니다.` }

  const appDb = ctx.appDb ?? getDb()
  const jobsDb = ctx.jobsDb ?? defaultJobsDb()
  const storageRoot = ctx.storageRoot ?? resolve(process.cwd(), 'storage')

  const academy = appDb.select().from(appSchema.academies).where(eq(appSchema.academies.id, input.academyId)).get()
  if (!academy) return { ok: false, error: '학원을 찾을 수 없습니다.' }

  const [batch] = appDb.insert(appSchema.homeworkBatches).values({
    academyId: academy.id,
    status: 'pending',
    userHint: input.userHint?.trim() || null,
  }).returning().all()

  try {
    for (let i = 0; i < input.files.length; i++) {
      const f = input.files[i]
      const bytes = Buffer.from(await f.arrayBuffer())
      const ext = extFromMime(f.type)
      const orig = await saveOriginal({ root: storageRoot, batchId: batch.id, index: i, ext, bytes })

      // Resize images; for PDFs (and HEIC) pass through original as the "resized" path.
      const resized = isResizableImage(f.type)
        ? await makeResized({ root: storageRoot, batchId: batch.id, index: i, originalPath: orig.path })
        : { path: orig.path, width: 0, height: 0, bytes: orig.bytes }

      appDb.insert(appSchema.homeworkPhotos).values({
        batchId: batch.id,
        originalPath: orig.path,
        resizedPath: resized.path,
        width: resized.width,
        height: resized.height,
        bytes: orig.bytes,
      }).run()
    }

    await enqueue(jobsDb, 'extract_homework', { batchId: batch.id })
  } catch (e: unknown) {
    appDb.update(appSchema.homeworkBatches).set({
      status: 'failed',
      failureReason: e instanceof Error ? e.message : String(e),
    }).where(eq(appSchema.homeworkBatches.id, batch.id)).run()
    throw e
  }

  revalidatePath('/')
  revalidatePath('/dashboard')
  revalidatePath('/homework/upload')
  return { ok: true, data: { batchId: batch.id } }
}

const UpdateInput = z.object({
  title: z.string().min(1).optional(),
  notes: z.union([z.string(), z.null()]).optional(),
  dueDate: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.null()]).optional(),
})

export async function updateDraftItem(itemId: number, patch: z.infer<typeof UpdateInput>, ctx: Ctx = {}): Promise<{ ok: boolean; error?: string }> {
  const parsed = UpdateInput.safeParse(patch)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'invalid' }
  const appDb = ctx.appDb ?? getDb()
  const item = appDb.select().from(appSchema.homeworkItems).where(eq(appSchema.homeworkItems.id, itemId)).get()
  if (!item) return { ok: false, error: '항목을 찾을 수 없습니다' }
  if (item.isCommitted) return { ok: false, error: '확정된 항목은 수정할 수 없습니다' }
  appDb.update(appSchema.homeworkItems).set(parsed.data).where(eq(appSchema.homeworkItems.id, itemId)).run()
  revalidatePath('/')
  revalidatePath('/dashboard')
  revalidatePath('/homework/upload')
  return { ok: true }
}

const AddDraftInput = z.object({
  title: z.string().min(1, '제목이 필요합니다'),
  notes: z.string().nullable().optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD 형식의 날짜').nullable(),
})

export async function addDraftItem(
  batchId: number,
  input: z.input<typeof AddDraftInput>,
  ctx: Ctx = {},
): Promise<{ ok: true; data: { id: number } } | { ok: false; error: string }> {
  const parsed = AddDraftInput.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'invalid input' }
  const appDb = ctx.appDb ?? getDb()
  const batch = appDb.select().from(appSchema.homeworkBatches).where(eq(appSchema.homeworkBatches.id, batchId)).get()
  if (!batch) return { ok: false, error: 'batch not found' }
  if (batch.status === 'committed') {
    return { ok: false, error: '확정된 batch에는 항목을 추가할 수 없습니다' }
  }
  const data = parsed.data
  const [row] = appDb.insert(appSchema.homeworkItems).values({
    batchId, academyId: batch.academyId, title: data.title.trim(), notes: data.notes ?? null, dueDate: data.dueDate,
    source: 'manual', isCommitted: false,
  }).returning({ id: appSchema.homeworkItems.id }).all()
  revalidatePath('/')
  revalidatePath('/dashboard')
  revalidatePath('/homework/upload')
  return { ok: true, data: { id: row.id } }
}

export async function deleteDraftItem(itemId: number, ctx: Ctx = {}) {
  const appDb = ctx.appDb ?? getDb()
  const item = appDb.select().from(appSchema.homeworkItems).where(eq(appSchema.homeworkItems.id, itemId)).get()
  if (!item) return { ok: false, error: '항목을 찾을 수 없습니다' }
  if (item.isCommitted) return { ok: false, error: '확정된 항목은 수정할 수 없습니다' }
  appDb.delete(appSchema.homeworkItems).where(eq(appSchema.homeworkItems.id, itemId)).run()
  revalidatePath('/')
  revalidatePath('/dashboard')
  revalidatePath('/homework/upload')
  return { ok: true }
}

export async function commitBatch(batchId: number, ctx: Ctx = {}) {
  const appDb = ctx.appDb ?? getDb()
  const batch = appDb.select().from(appSchema.homeworkBatches).where(eq(appSchema.homeworkBatches.id, batchId)).get()
  if (!batch) return { ok: false, error: '존재하지 않는 batch입니다' }
  if (batch.status === 'committed') return { ok: false, error: '이미 확정된 batch입니다' }
  if (batch.status !== 'ready') return { ok: false, error: `${batch.status} 상태의 batch는 확정할 수 없습니다` }

  // Block commit when any item has null dueDate AND the academy has no
  // schedule rule (runner can't auto-fill in that case).
  const academy = appDb.select().from(appSchema.academies).where(eq(appSchema.academies.id, batch.academyId)).get()
  const hasSchedule = !!academy?.scheduleRule?.slots?.length
  if (!hasSchedule) {
    const itemsMissingDate = appDb.select({ id: appSchema.homeworkItems.id, title: appSchema.homeworkItems.title })
      .from(appSchema.homeworkItems)
      .where(and(eq(appSchema.homeworkItems.batchId, batchId), isNull(appSchema.homeworkItems.dueDate)))
      .all()
    if (itemsMissingDate.length > 0) {
      const titles = itemsMissingDate.map((it) => it.title).join(', ')
      return { ok: false, error: `학원 시간표가 없어서 마감일을 자동 채울 수 없습니다. 직접 입력 필요: ${titles}` }
    }
  }

  appDb.transaction((tx) => {
    tx.update(appSchema.homeworkItems).set({ isCommitted: true }).where(eq(appSchema.homeworkItems.batchId, batchId)).run()
    tx.update(appSchema.homeworkBatches).set({ status: 'committed' }).where(eq(appSchema.homeworkBatches.id, batchId)).run()
  })
  revalidatePath('/')
  revalidatePath('/dashboard')
  revalidatePath('/homework/upload')
  return { ok: true }
}

export async function toggleItemDone(id: number, done: boolean, ctx: Ctx = {}): Promise<{ ok: true } | { ok: false; error: string }> {
  const appDb = ctx.appDb ?? getDb()
  appDb.update(appSchema.homeworkItems).set({ doneAt: done ? new Date() : null }).where(eq(appSchema.homeworkItems.id, id)).run()
  await tryStampToday({ db: appDb })
  revalidatePath('/')
  revalidatePath('/dashboard')
  return { ok: true }
}

export async function listCommittedItems(ctx: Ctx = {}) {
  const appDb = ctx.appDb ?? getDb()
  // SQL-side filter (doneAt IS NULL) + ORDER BY dueDate ASC NULLS LAST.
  return appDb.select({
    id: appSchema.homeworkItems.id,
    title: appSchema.homeworkItems.title,
    notes: appSchema.homeworkItems.notes,
    dueDate: appSchema.homeworkItems.dueDate,
    doneAt: appSchema.homeworkItems.doneAt,
    academyId: appSchema.homeworkItems.academyId,
    academyName: appSchema.academies.name,
    academyColor: appSchema.academies.color,
  })
  .from(appSchema.homeworkItems)
  .innerJoin(appSchema.academies, eq(appSchema.homeworkItems.academyId, appSchema.academies.id))
  .where(and(
    eq(appSchema.homeworkItems.isCommitted, true),
    isNull(appSchema.homeworkItems.doneAt),
  ))
  .orderBy(
    sql`CASE WHEN ${appSchema.homeworkItems.dueDate} IS NULL THEN 1 ELSE 0 END`,
    appSchema.homeworkItems.dueDate,
  )
  .all()
}

/**
 * Items completed in the current local calendar day, newest completion first.
 * "Today" boundary is computed by `localDayWindow()` (server local TZ).
 */
export async function listDoneToday(ctx: Ctx = {}) {
  const appDb = ctx.appDb ?? getDb()
  const { start, end } = localDayWindow()

  return appDb.select({
    id: appSchema.homeworkItems.id,
    title: appSchema.homeworkItems.title,
    notes: appSchema.homeworkItems.notes,
    dueDate: appSchema.homeworkItems.dueDate,
    doneAt: appSchema.homeworkItems.doneAt,
    academyId: appSchema.homeworkItems.academyId,
    academyName: appSchema.academies.name,
    academyColor: appSchema.academies.color,
  })
  .from(appSchema.homeworkItems)
  .innerJoin(appSchema.academies, eq(appSchema.homeworkItems.academyId, appSchema.academies.id))
  .where(and(
    eq(appSchema.homeworkItems.isCommitted, true),
    gte(appSchema.homeworkItems.doneAt, start),
    lt(appSchema.homeworkItems.doneAt, end),
  ))
  .orderBy(desc(appSchema.homeworkItems.doneAt))
  .all()
}

/**
 * Recent batches across all academies (last `limit`, newest first).
 * Used by the upload page to show "이전 업로드" for the selected academy.
 * Returns the batch + photo count + first photo path (for thumbnail).
 */
export async function listRecentBatches(opts: { limit?: number } = {}, ctx: Ctx = {}) {
  const appDb = ctx.appDb ?? getDb()
  const limit = opts.limit ?? 50

  const batches = appDb.select({
    id: appSchema.homeworkBatches.id,
    academyId: appSchema.homeworkBatches.academyId,
    capturedAt: appSchema.homeworkBatches.capturedAt,
    status: appSchema.homeworkBatches.status,
    userHint: appSchema.homeworkBatches.userHint,
    failureReason: appSchema.homeworkBatches.failureReason,
  })
  .from(appSchema.homeworkBatches)
  .orderBy(desc(appSchema.homeworkBatches.capturedAt))
  .limit(limit)
  .all()

  if (batches.length === 0) return []

  const ids = batches.map((b) => b.id)
  // Fetch photo summary per batch — scoped to the batches we actually return,
  // otherwise this is a full-table scan that grows linearly with all uploads.
  const photos = appDb.select({
    batchId: appSchema.homeworkPhotos.batchId,
    resizedPath: appSchema.homeworkPhotos.resizedPath,
    originalPath: appSchema.homeworkPhotos.originalPath,
  }).from(appSchema.homeworkPhotos).where(inArray(appSchema.homeworkPhotos.batchId, ids)).all()

  const byBatch = new Map<number, { count: number; firstPath: string | null; isPdf: boolean }>()
  for (const p of photos) {
    const cur = byBatch.get(p.batchId)
    if (!cur) {
      byBatch.set(p.batchId, {
        count: 1,
        firstPath: p.resizedPath,
        isPdf: p.resizedPath.toLowerCase().endsWith('.pdf') || p.originalPath.toLowerCase().endsWith('.pdf'),
      })
    } else {
      cur.count += 1
    }
  }

  // Item counts scoped to the batches we actually return (vs full-table scan).
  const itemCounts = appDb.select({
    batchId: appSchema.homeworkItems.batchId,
    cnt: sql<number>`count(*)`.as('cnt'),
  }).from(appSchema.homeworkItems)
    .where(inArray(appSchema.homeworkItems.batchId, ids))
    .groupBy(appSchema.homeworkItems.batchId).all()
  const itemMap = new Map(itemCounts.map((c) => [c.batchId, Number(c.cnt)]))

  return batches
    .map((b) => ({
      ...b,
      photoCount: byBatch.get(b.id)?.count ?? 0,
      firstPhotoPath: byBatch.get(b.id)?.firstPath ?? null,
      isPdf: byBatch.get(b.id)?.isPdf ?? false,
      itemCount: itemMap.get(b.id) ?? 0,
    }))
}

/**
 * Re-analyze a previous batch by creating a NEW batch that references the
 * same photo files. Old batch + its items stay intact for history.
 * Effective userHint: explicit `opts.userHint` (if defined) wins; otherwise
 * fall back to the original batch's hint.
 */
export async function rerunBatch(
  originalBatchId: number,
  opts: { userHint?: string | null } = {},
  ctx: Ctx = {},
): Promise<UploadResult> {
  const appDb = ctx.appDb ?? getDb()
  const jobsDb = ctx.jobsDb ?? defaultJobsDb()

  const original = appDb.select().from(appSchema.homeworkBatches).where(eq(appSchema.homeworkBatches.id, originalBatchId)).get()
  if (!original) return { ok: false, error: '원본 batch를 찾을 수 없습니다.' }

  const photos = appDb.select().from(appSchema.homeworkPhotos).where(eq(appSchema.homeworkPhotos.batchId, originalBatchId)).all()
  if (photos.length === 0) return { ok: false, error: '원본 batch에 파일이 없습니다.' }

  const effectiveHint =
    opts.userHint !== undefined
      ? (opts.userHint?.trim() || null)
      : original.userHint

  const [newBatch] = appDb.insert(appSchema.homeworkBatches).values({
    academyId: original.academyId,
    status: 'pending',
    userHint: effectiveHint,
  }).returning().all()

  appDb.insert(appSchema.homeworkPhotos).values(
    photos.map((p) => ({
      batchId: newBatch.id,
      originalPath: p.originalPath,
      resizedPath: p.resizedPath,
      width: p.width,
      height: p.height,
      bytes: p.bytes,
    })),
  ).run()

  await enqueue(jobsDb, 'extract_homework', { batchId: newBatch.id })
  revalidatePath('/')
  revalidatePath('/dashboard')
  revalidatePath('/homework/upload')
  return { ok: true, data: { batchId: newBatch.id } }
}

/**
 * Delete a batch (cascade deletes its photos + items via FK ON DELETE CASCADE).
 * Disk files (originalPath/resizedPath) are intentionally NOT removed —
 * other batches created via rerunBatch may still reference the same files.
 * A separate orphan-file cleanup job can handle disk later.
 */
export async function deleteBatch(id: number, ctx: Ctx = {}): Promise<{ ok: boolean; error?: string }> {
  const appDb = ctx.appDb ?? getDb()
  const exists = appDb.select({ id: appSchema.homeworkBatches.id }).from(appSchema.homeworkBatches).where(eq(appSchema.homeworkBatches.id, id)).get()
  if (!exists) return { ok: false, error: '존재하지 않는 batch' }
  appDb.delete(appSchema.homeworkBatches).where(eq(appSchema.homeworkBatches.id, id)).run()
  revalidatePath('/')
  revalidatePath('/dashboard')
  revalidatePath('/homework/upload')
  return { ok: true }
}

/**
 * Find batches that share at least one file (by originalPath) with the
 * given batch. Returns the related batches with their status, hint,
 * item counts, and created date. Used by re-analyze view to show
 * "이 파일의 분석 이력" — every attempt that used these files.
 */
export async function listRelatedBatches(batchId: number, ctx: Ctx = {}) {
  const appDb = ctx.appDb ?? getDb()

  const myPaths = appDb
    .select({ originalPath: appSchema.homeworkPhotos.originalPath })
    .from(appSchema.homeworkPhotos)
    .where(eq(appSchema.homeworkPhotos.batchId, batchId))
    .all()
    .map((r) => r.originalPath)

  if (myPaths.length === 0) return []

  const related = appDb
    .selectDistinct({ batchId: appSchema.homeworkPhotos.batchId })
    .from(appSchema.homeworkPhotos)
    .where(inArray(appSchema.homeworkPhotos.originalPath, myPaths))
    .all()

  const ids = related.map((r) => r.batchId)
  if (ids.length === 0) return []

  const batches = appDb.select({
    id: appSchema.homeworkBatches.id,
    capturedAt: appSchema.homeworkBatches.capturedAt,
    status: appSchema.homeworkBatches.status,
    userHint: appSchema.homeworkBatches.userHint,
    providerUsed: appSchema.homeworkBatches.providerUsed,
    modelUsed: appSchema.homeworkBatches.modelUsed,
    failureReason: appSchema.homeworkBatches.failureReason,
  })
    .from(appSchema.homeworkBatches)
    .where(inArray(appSchema.homeworkBatches.id, ids))
    .all()

  const itemCounts = appDb
    .select({
      batchId: appSchema.homeworkItems.batchId,
      cnt: sql<number>`count(*)`.as('cnt'),
    })
    .from(appSchema.homeworkItems)
    .where(inArray(appSchema.homeworkItems.batchId, ids))
    .groupBy(appSchema.homeworkItems.batchId)
    .all()
  const itemMap = new Map(itemCounts.map((c) => [c.batchId, Number(c.cnt)]))

  return batches
    .map((b) => ({ ...b, itemCount: itemMap.get(b.id) ?? 0 }))
    .sort((x, y) => y.capturedAt.getTime() - x.capturedAt.getTime())
}

/**
 * Permanently delete a committed homework item.
 */
export async function deleteHomeworkItem(
  itemId: number,
  opts?: { appDb?: AppDb },
): Promise<{ ok: boolean; error?: string }> {
  const appDb = opts?.appDb ?? getDb()
  const item = appDb.select().from(appSchema.homeworkItems).where(eq(appSchema.homeworkItems.id, itemId)).get()
  if (!item) return { ok: false, error: '항목을 찾을 수 없습니다' }
  if (!item.isCommitted) return { ok: false, error: '확정된 항목만 삭제 가능합니다' }
  appDb.delete(appSchema.homeworkItems).where(eq(appSchema.homeworkItems.id, itemId)).run()
  revalidatePath('/')
  revalidatePath('/dashboard')
  revalidatePath('/academies', 'layout')
  return { ok: true }
}

/**
 * Update a committed homework item's title, notes, and/or dueDate.
 */
export async function updateHomeworkItem(
  itemId: number,
  patch: { title?: string; notes?: string | null; dueDate?: string | null },
  opts?: { appDb?: AppDb },
): Promise<{ ok: boolean; error?: string }> {
  const appDb = opts?.appDb ?? getDb()
  const item = appDb.select().from(appSchema.homeworkItems).where(eq(appSchema.homeworkItems.id, itemId)).get()
  if (!item) return { ok: false, error: '항목을 찾을 수 없습니다' }
  if (!item.isCommitted) return { ok: false, error: '확정된 항목만 수정 가능합니다' }
  const update: Record<string, unknown> = {}
  if (patch.title !== undefined) {
    if (!patch.title.trim()) return { ok: false, error: '제목은 비울 수 없습니다' }
    update.title = patch.title.trim()
  }
  if (patch.notes !== undefined) update.notes = patch.notes
  if (patch.dueDate !== undefined) {
    if (patch.dueDate !== null && !/^\d{4}-\d{2}-\d{2}$/.test(patch.dueDate)) {
      return { ok: false, error: '잘못된 날짜' }
    }
    update.dueDate = patch.dueDate
  }
  appDb.update(appSchema.homeworkItems).set(update).where(eq(appSchema.homeworkItems.id, itemId)).run()
  revalidatePath('/')
  revalidatePath('/dashboard')
  revalidatePath('/academies', 'layout')
  return { ok: true }
}

/**
 * Defer a committed homework item to a new due date.
 */
export async function deferHomework(
  itemId: number,
  newDueDate: string,
  opts?: { appDb?: AppDb },
): Promise<{ ok: boolean; error?: string }> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(newDueDate)) {
    return { ok: false, error: '잘못된 날짜' }
  }
  const appDb = opts?.appDb ?? getDb()
  const item = appDb.select().from(appSchema.homeworkItems).where(eq(appSchema.homeworkItems.id, itemId)).get()
  if (!item) return { ok: false, error: '항목을 찾을 수 없습니다' }
  if (!item.isCommitted) return { ok: false, error: '확정 후 미루기 가능' }
  appDb.update(appSchema.homeworkItems).set({ dueDate: newDueDate }).where(eq(appSchema.homeworkItems.id, itemId)).run()
  revalidatePath('/')
  revalidatePath('/dashboard')
  revalidatePath('/academies')
  const academyId = item.academyId
  revalidatePath(`/academies/${academyId}`, 'page')
  return { ok: true }
}

/**
 * Bulk mark items done or undone.
 * Wraps updates in a transaction for atomicity.
 */
export async function bulkToggleItemsDone(
  ids: number[],
  done: boolean,
  ctx: Ctx = {},
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (ids.length === 0) return { ok: true }
  const appDb = ctx.appDb ?? getDb()
  appDb.update(appSchema.homeworkItems)
    .set({ doneAt: done ? new Date() : null })
    .where(inArray(appSchema.homeworkItems.id, ids))
    .run()
  revalidatePath('/')
  revalidatePath('/dashboard')
  return { ok: true }
}

/**
 * Bulk delete items by ID.
 * Uses the same cascade-safe delete path as deleteDraftItem
 * but works on any committed or draft item.
 */
export async function bulkDeleteItems(
  ids: number[],
  ctx: Ctx = {},
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (ids.length === 0) return { ok: true }
  const appDb = ctx.appDb ?? getDb()
  appDb.delete(appSchema.homeworkItems)
    .where(inArray(appSchema.homeworkItems.id, ids))
    .run()
  revalidatePath('/')
  revalidatePath('/dashboard')
  return { ok: true }
}
