import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import * as appSchema from '@/server/db/schema'
import * as jobsSchema from '@/server/jobs/schema'
import { claimNext, markDone, markFailed, reapStaleRunningJobs } from '@/server/jobs/queue'
import { processExtractHomework } from '@/server/jobs/runner'
import { getProvider } from '@/server/llm/registry'
import { and, eq } from 'drizzle-orm'
import { sendTelegram } from '@/server/notifications/telegram'
import { buildMorningDigest, buildEveningDigest, buildMiddayDigest } from '@/server/notifications/digests'
import { runBatchCleanup } from '@/server/util/batch-cleanup'

const CLEANUP_HHMM = '04:00'

// Note: we let drizzle's return type infer naturally (it includes the $client
// property in addition to BetterSQLite3Database<S> — needed by helpers like
// reapStaleRunningJobs that consume the full drizzle DB shape).
function openDb<S extends Record<string, unknown>>(file: string, migrations: string, schema: S) {
  mkdirSync(dirname(file), { recursive: true })
  const sqlite = new Database(file)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')
  const db = drizzle(sqlite, { schema })
  migrate(db, { migrationsFolder: migrations })
  return db
}

/** Asia/Seoul 현재 시각의 HH:MM 과 YYYY-MM-DD 반환 */
function seoulNow(): { hhmm: string; dateIso: string } {
  const now = new Date()
  // en-CA locale gives 'YYYY-MM-DD' format for date parts
  const dateParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const y = dateParts.find((p) => p.type === 'year')!.value
  const m = dateParts.find((p) => p.type === 'month')!.value
  const d = dateParts.find((p) => p.type === 'day')!.value
  const dateIso = `${y}-${m}-${d}`

  const timeParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now)
  const h = timeParts.find((p) => p.type === 'hour')!.value.padStart(2, '0')
  const min = timeParts.find((p) => p.type === 'minute')!.value.padStart(2, '0')
  const hhmm = `${h}:${min}`

  return { hhmm, dateIso }
}

type DigestKind = 'morning' | 'evening' | 'midday'

type JobsDb = ReturnType<typeof drizzle<typeof jobsSchema>>
type AppDb = ReturnType<typeof drizzle<typeof appSchema>>

async function maybeFireDigest(
  appDb: AppDb,
  jobsDb: JobsDb,
  kind: DigestKind,
  enabled: boolean,
  scheduledTime: string,
  currentHhmm: string,
  dateIso: string,
): Promise<void> {
  if (!enabled || scheduledTime !== currentHhmm) return

  // Already sent today? (unique index on kind+date_iso)
  const existing = jobsDb.select({ id: jobsSchema.digestLog.id })
    .from(jobsSchema.digestLog)
    .where(and(eq(jobsSchema.digestLog.kind, kind), eq(jobsSchema.digestLog.dateIso, dateIso)))
    .get()

  if (existing) return

  let text: string
  try {
    if (kind === 'morning') text = buildMorningDigest(appDb, dateIso)
    else if (kind === 'evening') text = buildEveningDigest(appDb, dateIso)
    else text = buildMiddayDigest(appDb, dateIso)
  } catch (e) {
    console.error(`[digest] ${kind} build failed:`, e)
    return
  }

  const result = await sendTelegram(text)
  if (!result.ok) {
    console.log(`[digest] ${kind} send failed: ${result.reason}`)
    return
  }

  // Only log if send succeeded
  try {
    jobsDb.insert(jobsSchema.digestLog)
      .values({ kind, sentAt: Date.now(), dateIso })
      .onConflictDoNothing()
      .run()
    console.log(`[digest] ${kind} sent for ${dateIso}`)
  } catch (e) {
    console.error(`[digest] log insert failed:`, e)
  }
}

async function main() {
  const appDbPath = process.env.APP_DB_PATH ?? resolve('data/app.db')
  const jobsDbPath = process.env.JOBS_DB_PATH ?? resolve('data/jobs.db')
  const appDb = openDb(appDbPath, resolve('server/db/migrations'), appSchema)
  const jobsDb = openDb(jobsDbPath, resolve('server/jobs/migrations'), jobsSchema)
  // ensure settings row
  appDb.insert(appSchema.appSettings).values({ id: 1 }).onConflictDoNothing().run()

  // Recover any stale running jobs from a previous crashed worker.
  // Also mark the corresponding batches as failed so users aren't stuck on
  // an infinite "processing" spinner.
  async function reapAndRecoverBatches() {
    const { count, batchIds } = await reapStaleRunningJobs(jobsDb, 10 * 60 * 1000)
    if (count > 0) console.log(`[worker] reaped ${count} stale running job(s)`)
    for (const bid of batchIds) {
      const b = appDb.select().from(appSchema.homeworkBatches).where(eq(appSchema.homeworkBatches.id, bid)).get()
      if (b && (b.status === 'processing' || b.status === 'pending')) {
        appDb.update(appSchema.homeworkBatches).set({
          status: 'failed',
          failureReason: '워커가 처리 중 종료됨 — 다시 분석해주세요',
        }).where(eq(appSchema.homeworkBatches.id, bid)).run()
        console.log(`[worker] marked batch#${bid} as failed (stuck in ${b.status})`)
      }
    }
  }
  await reapAndRecoverBatches()

  console.log('[worker] started, polling every 1s')

  let pollCount = 0
  let lastCheckedMinute = ''
  let lastCleanupDate = ''  // in-memory; cleanup is idempotent, so re-running on restart is safe

  while (true) {
    pollCount++
    // Periodically reap stale jobs (~every 60 polls = ~60s)
    if (pollCount % 60 === 0) {
      await reapAndRecoverBatches()
    }

    // Minute-tick: digest + daily batch cleanup
    const { hhmm, dateIso } = seoulNow()
    if (hhmm !== lastCheckedMinute) {
      lastCheckedMinute = hhmm
      try {
        const settings = appDb.select().from(appSchema.appSettings).where(eq(appSchema.appSettings.id, 1)).get()
        if (settings?.telegramEnabled) {
          await maybeFireDigest(appDb, jobsDb, 'morning', settings.telegramMorningEnabled, settings.telegramMorningTime, hhmm, dateIso)
          await maybeFireDigest(appDb, jobsDb, 'evening', settings.telegramEveningEnabled, settings.telegramEveningTime, hhmm, dateIso)
          await maybeFireDigest(appDb, jobsDb, 'midday', settings.telegramMiddayEnabled, settings.telegramMiddayTime, hhmm, dateIso)
        }
      } catch (e) {
        console.error('[digest] scheduler error:', e)
      }

      // Daily batch retention cleanup at 04:00 Seoul. Idempotent — safe to repeat.
      if (hhmm === CLEANUP_HHMM && lastCleanupDate !== dateIso) {
        lastCleanupDate = dateIso
        try {
          const res = runBatchCleanup(appDb)
          console.log(
            `[cleanup] ${dateIso} archived=${res.archivedBatchIds.length} `
            + `photosCleaned=${res.photosCleanedBatchIds.length}(files=${res.deletedPhotoFiles}) `
            + `failedDeleted=${res.deletedFailedBatchIds.length}`
          )
        } catch (e) {
          console.error('[cleanup] error:', e)
        }
      }
    }

    const job = await claimNext(jobsDb)
    if (!job) {
      await new Promise((r) => setTimeout(r, 1000))
      continue
    }
    try {
      console.log(`[worker] running job#${job.id} type=${job.type}`)
      if (job.type === 'extract_homework') {
        const settings = appDb.select().from(appSchema.appSettings).where(eq(appSchema.appSettings.id, 1)).get()
        const provider = getProvider(settings?.visionProvider ?? 'claude')
        await processExtractHomework(appDb, provider, { batchId: (job.payload as { batchId: number }).batchId, model: settings?.visionModel })
      } else {
        throw new Error(`Unknown job type: ${job.type}`)
      }
      await markDone(jobsDb, job.id)
      console.log(`[worker] job#${job.id} done`)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error(`[worker] job#${job.id} failed:`, msg)
      await markFailed(jobsDb, job.id, msg)
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
