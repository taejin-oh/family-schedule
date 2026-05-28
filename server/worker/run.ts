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

export type DigestResult = 'sent' | 'skipped' | 'retry'

export async function maybeFireDigest(
  appDb: AppDb,
  jobsDb: JobsDb,
  kind: DigestKind,
  enabled: boolean,
  scheduledTime: string,
  currentHhmm: string,
  dateIso: string,
): Promise<DigestResult> {
  if (!enabled || scheduledTime !== currentHhmm) return 'skipped'

  // Race-safe claim: digest_log에 nonce(고유 sentAt)로 INSERT OR IGNORE 후,
  // 같은 (kind, dateIso) row를 SELECT해서 우리 nonce가 박혔는지 검증.
  // drizzle .run()의 changes/lastInsertRowid 형태에 의존하지 않고 _저장된 값_으로
  // 우리 INSERT가 성공했는지 판단 → process restart 중 동시 polling이 와도 안전.
  // (이전 패턴은 changes !== 0 검사였는데 drizzle wrap에서 conflict 시에도 truthy
  //  로 떨어져 같은 분에 send가 3번까지 호출되는 사례 발생.)
  const ourNonce = Date.now() * 1000 + Math.floor(Math.random() * 1000)
  try {
    jobsDb.insert(jobsSchema.digestLog)
      .values({ kind, sentAt: ourNonce, dateIso })
      .onConflictDoNothing()
      .run()
  } catch (e) {
    // DB 일시 오류는 재시도 가치 있음.
    console.error(`[digest] ${kind} claim insert failed:`, e)
    return 'retry'
  }
  let claimed = false
  try {
    const row = jobsDb.select({ sentAt: jobsSchema.digestLog.sentAt })
      .from(jobsSchema.digestLog)
      .where(and(eq(jobsSchema.digestLog.kind, kind), eq(jobsSchema.digestLog.dateIso, dateIso)))
      .get()
    claimed = row?.sentAt === ourNonce
  } catch (e) {
    console.error(`[digest] ${kind} claim verify failed:`, e)
    return 'retry'
  }
  if (!claimed) return 'skipped'  // 이미 다른 호출자가 claim/발송 완료

  // Build digest text. 실패 시 claim rollback + retry 신호.
  // 호출자가 lastCheckedMinute을 비워 같은 분 안 다음 polling cycle이 재진입.
  let text: string
  try {
    if (kind === 'morning') text = buildMorningDigest(appDb, dateIso)
    else if (kind === 'evening') text = buildEveningDigest(appDb, dateIso)
    else text = buildMiddayDigest(appDb, dateIso)
  } catch (e) {
    console.error(`[digest] ${kind} build failed:`, e)
    jobsDb.delete(jobsSchema.digestLog)
      .where(and(eq(jobsSchema.digestLog.kind, kind), eq(jobsSchema.digestLog.dateIso, dateIso)))
      .run()
    return 'retry'
  }

  const result = await sendTelegram(text)
  if (!result.ok) {
    console.log(`[digest] ${kind} send failed: ${result.reason}`)
    jobsDb.delete(jobsSchema.digestLog)
      .where(and(eq(jobsSchema.digestLog.kind, kind), eq(jobsSchema.digestLog.dateIso, dateIso)))
      .run()
    return 'retry'
  }
  console.log(`[digest] ${kind} sent for ${dateIso}`)
  return 'sent'
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
  // 학원 ±N분 알림 중복 방지는 jobsDb.academy_reminder_log(date_iso, slot_key)
  // UNIQUE 인덱스로 영속화. process restart / 자정 경계에서도 중복 발송 안 됨.

  while (true) {
    pollCount++
    if (pollCount % 60 === 0) {
      await reapAndRecoverBatches()
    }

    const { hhmm, dateIso } = seoulNow()
    if (hhmm !== lastCheckedMinute) {
      lastCheckedMinute = hhmm

      try {
        const settings = appDb.select().from(appSchema.appSettings).where(eq(appSchema.appSettings.id, 1)).get()
        if (settings?.telegramEnabled) {
          // 점심 digest는 사용자 정의에 없어서 제거. schema column은 유지(legacy).
          const morningRes = await maybeFireDigest(appDb, jobsDb, 'morning', settings.telegramMorningEnabled, settings.telegramMorningTime, hhmm, dateIso)
          const eveningRes = await maybeFireDigest(appDb, jobsDb, 'evening', settings.telegramEveningEnabled, settings.telegramEveningTime, hhmm, dateIso)

          // digest build/send 실패 시 같은 분(scheduledTime) 안에서 다시 시도해야
          // 함. lastCheckedMinute 가드를 비워 다음 polling cycle이 minute block에
          // 재진입하도록 한다. 분이 바뀌면 scheduledTime !== hhmm이 되어 그날
          // 발송이 영구 손실되는 문제(이전 동작) 방지.
          // academy reminder는 in-memory dedupe Set, cleanup은 lastCleanupDate
          // 가드가 있어서 재진입해도 중복 실행 안 됨.
          if (morningRes === 'retry' || eveningRes === 'retry') {
            lastCheckedMinute = ''
          }

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
                // Race-safe claim — academy_reminder_log에 INSERT 시도.
                // (date_iso, slot_key) UNIQUE이므로 다른 worker/이전 process가
                // 이미 발송했으면 changes=0으로 skip. (이전 in-memory Set 방식은
                // process restart 시 dedupe 정보가 사라져 동일 슬롯 중복 발송 위험.)
                let claimed = false
                try {
                  const res = jobsDb.insert(jobsSchema.academyReminderLog)
                    .values({ dateIso, slotKey: ev.slotKey, sentAt: Date.now() })
                    .onConflictDoNothing()
                    .run()
                  claimed = (res as { changes?: number }).changes !== 0
                } catch (e) {
                  console.error(`[academy-reminder] claim failed for ${ev.slotKey}:`, e)
                  continue
                }
                if (!claimed) continue  // 이미 발송됨

                const result = await sendTelegram(ev.message)
                if (!result.ok) {
                  // send 실패 시 row 삭제하면 같은 분 안 재시도 가능하지만, 분이
                  // 바뀌면 slot match 조건(startBefore === nowMin)을 다시 만족하지
                  // 못해 그날 손실. 운영상 일시 실패는 다음 슬롯에서 자연스럽게
                  // 재발생하니 rollback 없이 silent log로 둠.
                  console.log(`[academy-reminder] send failed for ${ev.slotKey}: ${result.reason}`)
                  continue
                }
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
