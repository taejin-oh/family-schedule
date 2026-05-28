// 분리된 worker 본체. `worker.ts` (standalone) 와 `instrumentation.ts`
// (Next.js in-process 자동 시작) 둘 다 이 함수를 호출한다.
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { and, eq } from 'drizzle-orm'
import * as appSchema from '@/server/db/schema'
import * as jobsSchema from '@/server/jobs/schema'
import { claimNext, markDone, markFailed, reapStaleRunningJobs } from '@/server/jobs/queue'
import { processExtractHomework } from '@/server/jobs/runner'
import { getProvider } from '@/server/llm/registry'
import { sendTelegram } from '@/server/notifications/telegram'
import { buildMorningDigest, buildEveningDigest, buildMiddayDigest } from '@/server/notifications/digests'
import { findUpcomingAcademyEvents } from '@/server/notifications/academy-reminders'
import { runBatchCleanup } from '@/server/util/batch-cleanup'
import { runEventsCleanup } from '@/server/util/events-cleanup'

const CLEANUP_HHMM = '04:00'

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

/**
 * Worker 본체. 무한 polling 루프. 호출자가 종료해야 멈춘다 (현재는 종료 훅 없음 —
 * Node.js process 종료 시 함께 끝남).
 *
 * 안전성: 이 함수를 두 번 호출하면 같은 DB에 두 client가 동시 polling/claim
 * 하게 되어 race condition 위험. 호출 측(instrumentation 또는 worker.ts)이
 * single-instance를 보장해야 한다.
 */
export async function runWorker(): Promise<void> {
  const appDbPath = process.env.APP_DB_PATH ?? resolve('data/app.db')
  const jobsDbPath = process.env.JOBS_DB_PATH ?? resolve('data/jobs.db')
  const appDb = openDb(appDbPath, resolve('server/db/migrations'), appSchema)
  const jobsDb = openDb(jobsDbPath, resolve('server/jobs/migrations'), jobsSchema)
  // ensure settings row
  appDb.insert(appSchema.appSettings).values({ id: 1 }).onConflictDoNothing().run()

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
  let lastCleanupDate = ''
  // 학원 ±10분 알림 중복 방지. 형식: "YYYY-MM-DD|{academyId}|{day}|{start}|{start|end}"
  // 매일 자정 넘어가면 초기화.
  const sentAcademyReminders = new Set<string>()
  let lastReminderDate = ''

  while (true) {
    pollCount++
    if (pollCount % 60 === 0) {
      await reapAndRecoverBatches()
    }

    const { hhmm, dateIso } = seoulNow()
    if (hhmm !== lastCheckedMinute) {
      lastCheckedMinute = hhmm

      // 매일 자정 넘어가면 학원 알림 dedupe set 초기화
      if (dateIso !== lastReminderDate) {
        sentAcademyReminders.clear()
        lastReminderDate = dateIso
      }

      try {
        const settings = appDb.select().from(appSchema.appSettings).where(eq(appSchema.appSettings.id, 1)).get()
        if (settings?.telegramEnabled) {
          // 점심 digest는 사용자 정의에 없어서 제거. schema column은 유지(legacy).
          await maybeFireDigest(appDb, jobsDb, 'morning', settings.telegramMorningEnabled, settings.telegramMorningTime, hhmm, dateIso)
          await maybeFireDigest(appDb, jobsDb, 'evening', settings.telegramEveningEnabled, settings.telegramEveningTime, hhmm, dateIso)

          // 학원 ±N분 알림 — 매분 polling에서 매치 검사. settings로 토글 + 분 단위 제어.
          if (settings.telegramAcademyReminderEnabled) {
            try {
              const events = findUpcomingAcademyEvents(
                appDb,
                dateIso,
                hhmm,
                settings.telegramAcademyReminderMinutes,
              )
              for (const ev of events) {
                const dedupeKey = `${dateIso}|${ev.slotKey}`
                if (sentAcademyReminders.has(dedupeKey)) continue
                sentAcademyReminders.add(dedupeKey)
                await sendTelegram(ev.message)
                console.log(`[academy-reminder] ${ev.type} ${ev.academyName} @${hhmm} (slot ${ev.slotStart})`)
              }
            } catch (e) {
              console.error('[academy-reminder] error:', e)
            }
          }
        }
      } catch (e) {
        console.error('[digest] scheduler error:', e)
      }

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
        try {
          const evRes = runEventsCleanup(appDb)
          console.log(`[events-cleanup] ${dateIso} deleted=${evRes.deleted} cutoff<${evRes.cutoff}`)
        } catch (e) {
          console.error('[events-cleanup] error:', e)
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
