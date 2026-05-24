'use server'

import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { resolve, dirname } from 'node:path'
import { mkdirSync } from 'node:fs'
import * as appSchema from '@/server/db/schema'
import * as jobsSchema from '@/server/jobs/schema'
import { getDb } from '@/server/db/client'
import { enqueue } from '@/server/jobs/queue'
import { saveOriginal, makeResized } from '@/server/storage/photos'

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

export type UploadInput = { academyId: number; files: File[] }
export type UploadResult = { ok: true; data: { batchId: number } } | { ok: false; error: string }

const ACCEPTED_MIMES = new Set([
  'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'application/pdf',
])

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
    academyId: academy.id, status: 'pending',
  }).returning().all()

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
  return { ok: true, data: { batchId: batch.id } }
}

const UpdateInput = z.object({
  title: z.string().min(1).optional(),
  dueDate: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.null()]).optional(),
})

export async function updateDraftItem(itemId: number, patch: z.infer<typeof UpdateInput>, ctx: Ctx = {}): Promise<{ ok: boolean; error?: string }> {
  const parsed = UpdateInput.safeParse(patch)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'invalid' }
  const appDb = ctx.appDb ?? getDb()
  appDb.update(appSchema.homeworkItems).set(parsed.data).where(eq(appSchema.homeworkItems.id, itemId)).run()
  return { ok: true }
}

export async function addDraftItem(batchId: number, input: { title: string; dueDate: string | null }, ctx: Ctx = {}) {
  const appDb = ctx.appDb ?? getDb()
  const batch = appDb.select().from(appSchema.homeworkBatches).where(eq(appSchema.homeworkBatches.id, batchId)).get()
  if (!batch) return { ok: false, error: 'batch not found' }
  appDb.insert(appSchema.homeworkItems).values({
    batchId, academyId: batch.academyId, title: input.title, dueDate: input.dueDate,
    source: 'manual', isCommitted: false,
  }).run()
  return { ok: true }
}

export async function deleteDraftItem(itemId: number, ctx: Ctx = {}) {
  const appDb = ctx.appDb ?? getDb()
  appDb.delete(appSchema.homeworkItems).where(eq(appSchema.homeworkItems.id, itemId)).run()
  return { ok: true }
}

export async function commitBatch(batchId: number, ctx: Ctx = {}) {
  const appDb = ctx.appDb ?? getDb()
  appDb.transaction((tx) => {
    tx.update(appSchema.homeworkItems).set({ isCommitted: true }).where(eq(appSchema.homeworkItems.batchId, batchId)).run()
    tx.update(appSchema.homeworkBatches).set({ status: 'committed' }).where(eq(appSchema.homeworkBatches.id, batchId)).run()
  })
  return { ok: true }
}
