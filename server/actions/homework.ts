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
import { localDayWindow, localWeekWindow } from '@/server/util/date'
import { tryStampToday } from '@/server/actions/stickers'
import { logServerEvent } from '@/server/log/server-event'

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
  const t0 = performance.now()
  const appDb = ctx.appDb ?? getDb()
  const academy = appDb.select().from(appSchema.academies).where(eq(appSchema.academies.id, academyId)).get()
  if (!academy) return { ok: false, error: '학원을 찾을 수 없습니다.' }
  const [batch] = appDb.insert(appSchema.homeworkBatches).values({
    academyId,
    status: 'ready',
  }).returning().all()
  // 빈 batch — committed item 없음 → 아이 홈/대시보드/시간표 진행률은 영향 없음.
  // 업로드 페이지의 batch 목록만 revalidate.
  revalidatePath('/homework/upload')
  await logServerEvent({ category: 'perf', event: 'createEmptyBatch', props: { academyId, batchId: batch.id, ms: Math.round(performance.now() - t0) } })
  await logServerEvent({ category: 'mutation', event: 'homework.empty_batch', props: { batchId: batch.id, academyId } })
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
        originalName: f.name?.trim() || null,   // 업로드 당시 실제 파일명
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
  revalidatePath('/timetable')
  revalidatePath('/homework/upload')
  await logServerEvent({ category: 'mutation', event: 'homework.upload', props: { batchId: batch.id, academyId: academy.id, fileCount: input.files.length, hasHint: !!input.userHint?.trim() } })
  return { ok: true, data: { batchId: batch.id } }
}

const UpdateInput = z.object({
  title: z.string().min(1).max(500, '제목이 너무 깁니다').optional(),
  notes: z.union([z.string().max(5000, '메모가 너무 깁니다'), z.null()]).optional(),
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
  revalidatePath('/timetable')
  revalidatePath('/homework/upload')
  // caller가 _실제로 보낸_ 필드만 추출 (zod optional이라 parsed.data는 undefined 키도 포함).
  const changedFields = (Object.keys(patch) as Array<keyof typeof patch>).filter((k) => patch[k] !== undefined)
  await logServerEvent({ category: 'mutation', event: 'homework.draft_update', props: { itemId, fields: changedFields } })
  return { ok: true }
}

const AddDraftInput = z.object({
  title: z.string().min(1, '제목이 필요합니다').max(500, '제목이 너무 깁니다'),
  notes: z.string().max(5000, '메모가 너무 깁니다').nullable().optional(),
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
  revalidatePath('/timetable')
  revalidatePath('/homework/upload')
  await logServerEvent({ category: 'mutation', event: 'homework.draft_add', props: { itemId: row.id, batchId, academyId: batch.academyId, hasDue: !!data.dueDate, hasNotes: !!data.notes } })
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
  revalidatePath('/timetable')
  revalidatePath('/homework/upload')
  await logServerEvent({ category: 'mutation', event: 'homework.draft_delete', props: { itemId, source: item.source, ageMs: Date.now() - new Date(item.createdAt).getTime() } })
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

  const itemCount = appDb.select({ id: appSchema.homeworkItems.id }).from(appSchema.homeworkItems).where(eq(appSchema.homeworkItems.batchId, batchId)).all().length
  appDb.transaction((tx) => {
    tx.update(appSchema.homeworkItems).set({ isCommitted: true }).where(eq(appSchema.homeworkItems.batchId, batchId)).run()
    tx.update(appSchema.homeworkBatches).set({ status: 'committed' }).where(eq(appSchema.homeworkBatches.id, batchId)).run()
  })
  revalidatePath('/')
  revalidatePath('/dashboard')
  revalidatePath('/timetable')
  revalidatePath('/homework/upload')
  await logServerEvent({ category: 'mutation', event: 'homework.commit', props: { batchId, itemCount } })
  return { ok: true }
}

export async function toggleItemDone(id: number, done: boolean, ctx: Ctx = {}): Promise<{ ok: true } | { ok: false; error: string }> {
  const appDb = ctx.appDb ?? getDb()
  // academy detail 페이지(`/academies/[id]`) revalidate에 academyId가 필요.
  // defer/delete/update 같은 다른 mutation은 이미 academy revalidate를 하는데
  // toggleItemDone만 빠져 있어 학원 상세에서 done 토글 후 stale 표시 발생.
  // row가 없으면 이전 동작(ok:true) 보존 — update.run()은 id 없으면 changes=0.
  const row = appDb.select({ academyId: appSchema.homeworkItems.academyId })
    .from(appSchema.homeworkItems)
    .where(eq(appSchema.homeworkItems.id, id))
    .get()
  appDb.update(appSchema.homeworkItems).set({ doneAt: done ? new Date() : null }).where(eq(appSchema.homeworkItems.id, id)).run()
  await tryStampToday({ db: appDb })
  revalidatePath('/')
  revalidatePath('/dashboard')
  revalidatePath('/timetable')
  if (row) revalidatePath(`/academies/${row.academyId}`)
  await logServerEvent({ category: 'mutation', event: done ? 'homework.done' : 'homework.undone', props: { itemId: id } })
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
    pinnedDate: appSchema.homeworkItems.pinnedDate,
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
 * 미완료 committed item 중 dueDate 또는 pinnedDate가 [today+maxDaysFromToday] 이하.
 * 아이 홈처럼 작은 결과셋만 필요한 페이지에서 listCommittedItems 전체 fetch 대신 사용.
 * pinnedDate가 있는 항목은 dueDate가 미래여도 아이 홈에 미리 노출하기 위함.
 */
export async function listTodoByDueWithin(
  todayIso: string,
  maxDaysFromToday: number,
  ctx: Ctx = {},
) {
  const appDb = ctx.appDb ?? getDb()
  const end = new Date(todayIso + 'T00:00:00')
  end.setDate(end.getDate() + maxDaysFromToday)
  const endIso = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`

  return appDb.select({
    id: appSchema.homeworkItems.id,
    title: appSchema.homeworkItems.title,
    notes: appSchema.homeworkItems.notes,
    dueDate: appSchema.homeworkItems.dueDate,
    pinnedDate: appSchema.homeworkItems.pinnedDate,
    academyId: appSchema.homeworkItems.academyId,
    academyName: appSchema.academies.name,
    academyColor: appSchema.academies.color,
  })
  .from(appSchema.homeworkItems)
  .innerJoin(appSchema.academies, eq(appSchema.homeworkItems.academyId, appSchema.academies.id))
  .where(and(
    eq(appSchema.homeworkItems.isCommitted, true),
    isNull(appSchema.homeworkItems.doneAt),
    // dueDate가 범위 안이거나, pinnedDate가 범위 안인 항목 포함.
    // outer paren 필수 — drizzle and(...)와 합쳐질 때 SQL precedence(AND > OR)에
    // 따라 OR가 전체 절을 갈라치는 것을 막아 isCommitted/doneAt 필터가 양쪽 모두에
    // 적용되도록 한다.
    sql`((${appSchema.homeworkItems.dueDate} IS NOT NULL AND ${appSchema.homeworkItems.dueDate} <= ${endIso})
        OR (${appSchema.homeworkItems.pinnedDate} IS NOT NULL AND ${appSchema.homeworkItems.pinnedDate} <= ${endIso}))`,
  ))
  // 정렬은 "아이가 실제로 봐야 하는 날짜" 기준 — pinnedDate가 있으면 그게 먼저.
  .orderBy(sql`COALESCE(${appSchema.homeworkItems.pinnedDate}, ${appSchema.homeworkItems.dueDate})`)
  .all()
}

/**
 * 미완료 committed item 중 dueDate 또는 pinnedDate가 [from, to] 사이.
 * 아이 홈 "이번 주 남은" 영역, day 페이지 등에서 사용.
 * pinnedDate가 있는 항목도 같은 범위에 포함 — 미리 시작하는 숙제를 그날 화면에서 보이게.
 */
export async function listTodoByDueBetween(
  fromIso: string,
  toIso: string,
  ctx: Ctx = {},
) {
  const appDb = ctx.appDb ?? getDb()
  return appDb.select({
    id: appSchema.homeworkItems.id,
    title: appSchema.homeworkItems.title,
    notes: appSchema.homeworkItems.notes,
    dueDate: appSchema.homeworkItems.dueDate,
    pinnedDate: appSchema.homeworkItems.pinnedDate,
    academyId: appSchema.homeworkItems.academyId,
    academyName: appSchema.academies.name,
    academyColor: appSchema.academies.color,
  })
  .from(appSchema.homeworkItems)
  .innerJoin(appSchema.academies, eq(appSchema.homeworkItems.academyId, appSchema.academies.id))
  .where(and(
    eq(appSchema.homeworkItems.isCommitted, true),
    isNull(appSchema.homeworkItems.doneAt),
    // outer paren 필수 — listTodoByDueWithin의 주석 참고.
    sql`((${appSchema.homeworkItems.dueDate} IS NOT NULL AND ${appSchema.homeworkItems.dueDate} BETWEEN ${fromIso} AND ${toIso})
        OR (${appSchema.homeworkItems.pinnedDate} IS NOT NULL AND ${appSchema.homeworkItems.pinnedDate} BETWEEN ${fromIso} AND ${toIso}))`,
  ))
  // pinnedDate 있으면 그 날짜 기준으로 정렬 — 같은 날 묶기 위해.
  .orderBy(sql`COALESCE(${appSchema.homeworkItems.pinnedDate}, ${appSchema.homeworkItems.dueDate})`)
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

/** 이번 주(월요일 자정 ~ 다음 주 월요일 직전) 안에 완료된 모든 committed homework. */
export async function listDoneThisWeek(ctx: Ctx = {}) {
  const appDb = ctx.appDb ?? getDb()
  const { start, end } = localWeekWindow()

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
 * Returns the batch + photo count + first photo path (for thumbnail) + due-range
 * summary + archive lifecycle fields.
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
    archivedAt: appSchema.homeworkBatches.archivedAt,
    photosCleanedAt: appSchema.homeworkBatches.photosCleanedAt,
  })
  .from(appSchema.homeworkBatches)
  .orderBy(desc(appSchema.homeworkBatches.capturedAt))
  .limit(limit)
  .all()

  if (batches.length === 0) return []

  const ids = batches.map((b) => b.id)
  const photos = appDb.select({
    id: appSchema.homeworkPhotos.id,
    batchId: appSchema.homeworkPhotos.batchId,
    resizedPath: appSchema.homeworkPhotos.resizedPath,
    originalPath: appSchema.homeworkPhotos.originalPath,
    originalName: appSchema.homeworkPhotos.originalName,
  }).from(appSchema.homeworkPhotos).where(inArray(appSchema.homeworkPhotos.batchId, ids)).all()

  const byBatch = new Map<number, { count: number; firstId: number; firstPath: string | null; firstName: string | null; isPdf: boolean }>()
  for (const p of photos) {
    const cur = byBatch.get(p.batchId)
    if (!cur) {
      byBatch.set(p.batchId, {
        count: 1,
        firstId: p.id,
        firstPath: p.resizedPath,
        firstName: p.originalName,
        isPdf: p.resizedPath.toLowerCase().endsWith('.pdf') || p.originalPath.toLowerCase().endsWith('.pdf'),
      })
    } else {
      cur.count += 1
    }
  }

  const itemAgg = appDb.select({
    batchId: appSchema.homeworkItems.batchId,
    cnt: sql<number>`count(*)`.as('cnt'),
    minDue: sql<string | null>`min(${appSchema.homeworkItems.dueDate})`.as('minDue'),
    maxDue: sql<string | null>`max(${appSchema.homeworkItems.dueDate})`.as('maxDue'),
  }).from(appSchema.homeworkItems)
    .where(inArray(appSchema.homeworkItems.batchId, ids))
    .groupBy(appSchema.homeworkItems.batchId).all()
  const itemMap = new Map(itemAgg.map((c) => [c.batchId, c]))

  return batches.map((b) => {
    const agg = itemMap.get(b.id)
    return {
      ...b,
      photoCount: byBatch.get(b.id)?.count ?? 0,
      firstPhotoId: byBatch.get(b.id)?.firstId ?? null,
      firstPhotoPath: byBatch.get(b.id)?.firstPath ?? null,
      firstPhotoName: byBatch.get(b.id)?.firstName ?? null,
      isPdf: byBatch.get(b.id)?.isPdf ?? false,
      itemCount: agg ? Number(agg.cnt) : 0,
      minDue: agg?.minDue ?? null,
      maxDue: agg?.maxDue ?? null,
    }
  })
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
  revalidatePath('/timetable')
  revalidatePath('/homework/upload')
  await logServerEvent({ category: 'mutation', event: 'homework.rerun', props: { originalBatchId, newBatchId: newBatch.id, hintChanged: opts.userHint !== undefined } })
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
  revalidatePath('/timetable')
  revalidatePath('/homework/upload')
  await logServerEvent({ category: 'mutation', event: 'homework.batch_delete', props: { batchId: id } })
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
  revalidatePath('/timetable')
  revalidatePath('/academies', 'layout')
  await logServerEvent({ category: 'mutation', event: 'homework.item_delete', props: { itemId, source: item.source, ageMs: Date.now() - new Date(item.createdAt).getTime(), wasDone: !!item.doneAt } })
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
  revalidatePath('/timetable')
  revalidatePath('/academies', 'layout')
  await logServerEvent({ category: 'mutation', event: 'homework.item_update', props: { itemId, fields: Object.keys(update) } })
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
  revalidatePath('/timetable')
  revalidatePath('/academies')
  const academyId = item.academyId
  revalidatePath(`/academies/${academyId}`, 'page')
  await logServerEvent({ category: 'mutation', event: 'homework.defer', props: { itemId, fromDue: item.dueDate, toDue: newDueDate } })
  return { ok: true }
}

/**
 * 숙제 미리 보기 핀 — dueDate는 그대로 두고 pinnedDate를 set.
 * dateIso는 'YYYY-MM-DD' (보통 오늘 또는 내일).
 * isCommitted=false인 draft에는 적용 불가.
 */
export async function pinHomeworkToDate(
  itemId: number,
  dateIso: string,
  opts?: { appDb?: AppDb },
): Promise<{ ok: boolean; error?: string }> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) {
    return { ok: false, error: '잘못된 날짜' }
  }
  const appDb = opts?.appDb ?? getDb()
  const item = appDb.select().from(appSchema.homeworkItems).where(eq(appSchema.homeworkItems.id, itemId)).get()
  if (!item) return { ok: false, error: '항목을 찾을 수 없습니다' }
  if (!item.isCommitted) return { ok: false, error: '확정된 항목만 미리 보이기 가능' }
  appDb.update(appSchema.homeworkItems).set({ pinnedDate: dateIso }).where(eq(appSchema.homeworkItems.id, itemId)).run()
  revalidatePath('/')
  revalidatePath('/dashboard')
  revalidatePath('/timetable')
  revalidatePath(`/academies/${item.academyId}`)
  await logServerEvent({ category: 'mutation', event: 'homework.pin', props: { itemId, dateIso } })
  return { ok: true }
}

/**
 * 미리 보기 핀 해제 — pinnedDate=null.
 */
export async function unpinHomework(
  itemId: number,
  opts?: { appDb?: AppDb },
): Promise<{ ok: boolean; error?: string }> {
  const appDb = opts?.appDb ?? getDb()
  const item = appDb.select().from(appSchema.homeworkItems).where(eq(appSchema.homeworkItems.id, itemId)).get()
  if (!item) return { ok: false, error: '항목을 찾을 수 없습니다' }
  appDb.update(appSchema.homeworkItems).set({ pinnedDate: null }).where(eq(appSchema.homeworkItems.id, itemId)).run()
  revalidatePath('/')
  revalidatePath('/dashboard')
  revalidatePath('/timetable')
  revalidatePath(`/academies/${item.academyId}`)
  await logServerEvent({ category: 'mutation', event: 'homework.unpin', props: { itemId } })
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
  // 영향받는 항목들의 고유 academyId 수집 — academy 상세(`/academies/[id]`) revalidate용.
  // toggleItemDone/pin/unpin은 academy 경로를 revalidate하는데 bulk만 빠져 있어
  // 대시보드에서 bulk 토글 후 학원 상세가 stale. academyId는 notNull.
  const academyIds = appDb
    .selectDistinct({ academyId: appSchema.homeworkItems.academyId })
    .from(appSchema.homeworkItems)
    .where(inArray(appSchema.homeworkItems.id, ids))
    .all()
  appDb.update(appSchema.homeworkItems)
    .set({ doneAt: done ? new Date() : null })
    .where(inArray(appSchema.homeworkItems.id, ids))
    .run()
  revalidatePath('/')
  revalidatePath('/dashboard')
  revalidatePath('/timetable')
  for (const { academyId } of academyIds) revalidatePath(`/academies/${academyId}`)
  await logServerEvent({ category: 'mutation', event: done ? 'homework.bulk_done' : 'homework.bulk_undone', props: { count: ids.length } })
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
  revalidatePath('/timetable')
  await logServerEvent({ category: 'mutation', event: 'homework.bulk_delete', props: { count: ids.length } })
  return { ok: true }
}
