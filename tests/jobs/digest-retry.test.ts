import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import * as appSchema from '@/server/db/schema'
import * as jobsSchema from '@/server/jobs/schema'

vi.mock('@/server/notifications/telegram', () => ({
  sendTelegram: vi.fn(),
}))
vi.mock('@/server/notifications/digests', () => ({
  buildMorningDigest: vi.fn(() => 'morning text'),
  buildEveningDigest: vi.fn(() => 'evening text'),
  buildMiddayDigest: vi.fn(() => 'midday text'),
}))

import { sendTelegram } from '@/server/notifications/telegram'
import { maybeFireDigest } from '@/server/worker/run'

function makeJobsDb() {
  const path = join(mkdtempSync(join(tmpdir(), 'fs-digretry-jobs-')), 'jobs.db')
  const sqlite = new Database(path)
  sqlite.pragma('journal_mode = WAL')
  const db = drizzle(sqlite, { schema: jobsSchema })
  migrate(db, { migrationsFolder: './server/jobs/migrations' })
  return db
}

function makeAppDb() {
  const path = join(mkdtempSync(join(tmpdir(), 'fs-digretry-app-')), 'app.db')
  const sqlite = new Database(path)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')
  const db = drizzle(sqlite, { schema: appSchema })
  migrate(db, { migrationsFolder: './server/db/migrations' })
  db.insert(appSchema.appSettings).values({ id: 1 }).onConflictDoNothing().run()
  return db
}

describe('maybeFireDigest — rollback & retry', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns "skipped" when scheduledTime does not match currentHhmm', async () => {
    const appDb = makeAppDb()
    const jobsDb = makeJobsDb()

    const res = await maybeFireDigest(appDb, jobsDb, 'morning', true, '07:00', '07:01', '2026-05-29')

    expect(res).toBe('skipped')
    expect(sendTelegram).not.toHaveBeenCalled()
    expect(jobsDb.select().from(jobsSchema.digestLog).all()).toHaveLength(0)
  })

  it('returns "skipped" when disabled', async () => {
    const appDb = makeAppDb()
    const jobsDb = makeJobsDb()

    const res = await maybeFireDigest(appDb, jobsDb, 'morning', false, '07:00', '07:00', '2026-05-29')

    expect(res).toBe('skipped')
    expect(sendTelegram).not.toHaveBeenCalled()
  })

  it('returns "skipped" when digest_log already has the (kind, dateIso) row', async () => {
    const appDb = makeAppDb()
    const jobsDb = makeJobsDb()
    jobsDb.insert(jobsSchema.digestLog)
      .values({ kind: 'morning', sentAt: Date.now(), dateIso: '2026-05-29' })
      .run()

    const res = await maybeFireDigest(appDb, jobsDb, 'morning', true, '07:00', '07:00', '2026-05-29')

    expect(res).toBe('skipped')
    expect(sendTelegram).not.toHaveBeenCalled()
    expect(jobsDb.select().from(jobsSchema.digestLog).all()).toHaveLength(1)
  })

  it('returns "retry" and leaves digest_log empty when send fails', async () => {
    const appDb = makeAppDb()
    const jobsDb = makeJobsDb()
    vi.mocked(sendTelegram).mockResolvedValueOnce({ ok: false, reason: 'http 500' })

    const res = await maybeFireDigest(appDb, jobsDb, 'morning', true, '07:00', '07:00', '2026-05-29')

    expect(res).toBe('retry')
    expect(sendTelegram).toHaveBeenCalledOnce()
    expect(jobsDb.select().from(jobsSchema.digestLog).all()).toHaveLength(0)
  })

  it('returns "sent" and records digest_log when send succeeds', async () => {
    const appDb = makeAppDb()
    const jobsDb = makeJobsDb()
    vi.mocked(sendTelegram).mockResolvedValueOnce({ ok: true })

    const res = await maybeFireDigest(appDb, jobsDb, 'morning', true, '07:00', '07:00', '2026-05-29')

    expect(res).toBe('sent')
    expect(jobsDb.select().from(jobsSchema.digestLog).all()).toHaveLength(1)
  })

  it('full sequence: send fails then succeeds in the same minute', async () => {
    // 이전 동작에서는 첫 실패 후 같은 분 안 재시도 불가 + 다음 분이 되면
    // scheduledTime !== hhmm으로 영구 손실. 이제는 retry → 재호출 → sent.
    const appDb = makeAppDb()
    const jobsDb = makeJobsDb()
    vi.mocked(sendTelegram)
      .mockResolvedValueOnce({ ok: false, reason: 'http 500' })
      .mockResolvedValueOnce({ ok: true })

    const first = await maybeFireDigest(appDb, jobsDb, 'morning', true, '07:00', '07:00', '2026-05-29')
    expect(first).toBe('retry')
    expect(jobsDb.select().from(jobsSchema.digestLog).all()).toHaveLength(0)

    const second = await maybeFireDigest(appDb, jobsDb, 'morning', true, '07:00', '07:00', '2026-05-29')
    expect(second).toBe('sent')
    expect(jobsDb.select().from(jobsSchema.digestLog).all()).toHaveLength(1)

    expect(sendTelegram).toHaveBeenCalledTimes(2)
  })

  it('after "sent" subsequent calls in the same minute return "skipped" (no double-send)', async () => {
    const appDb = makeAppDb()
    const jobsDb = makeJobsDb()
    vi.mocked(sendTelegram).mockResolvedValueOnce({ ok: true })

    const first = await maybeFireDigest(appDb, jobsDb, 'morning', true, '07:00', '07:00', '2026-05-29')
    expect(first).toBe('sent')

    const second = await maybeFireDigest(appDb, jobsDb, 'morning', true, '07:00', '07:00', '2026-05-29')
    expect(second).toBe('skipped')

    expect(sendTelegram).toHaveBeenCalledTimes(1)
    expect(jobsDb.select().from(jobsSchema.digestLog).all()).toHaveLength(1)
  })
})
