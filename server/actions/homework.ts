'use server'

import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { eq } from 'drizzle-orm'
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
  return 'bin'
}

export type UploadInput = { academyId: number; files: File[] }
export type UploadResult = { ok: true; data: { batchId: number } } | { ok: false; error: string }

export async function uploadHomework(input: UploadInput, ctx: Ctx = {}): Promise<UploadResult> {
  if (!input.files || input.files.length === 0) return { ok: false, error: '사진을 한 장 이상 선택하세요.' }
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
    const resized = await makeResized({ root: storageRoot, batchId: batch.id, index: i, originalPath: orig.path })
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
