import { describe, it, expect, vi } from 'vitest'
import { mkdtempSync } from 'node:fs'; import { tmpdir } from 'node:os'; import { join } from 'node:path'
import Database from 'better-sqlite3'; import { drizzle } from 'drizzle-orm/better-sqlite3'; import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import * as appSchema from '@/server/db/schema'; import * as jobsSchema from '@/server/jobs/schema'
import { maybeFireWeekly } from '@/server/worker/run'

function makeDbs() {
  const dir = mkdtempSync(join(tmpdir(), 'fs-wf-'))
  const appDb = drizzle(new Database(join(dir, 'app.db')), { schema: appSchema }); migrate(appDb, { migrationsFolder: './server/db/migrations' })
  const jobsDb = drizzle(new Database(join(dir, 'jobs.db')), { schema: jobsSchema }); migrate(jobsDb, { migrationsFolder: './server/jobs/migrations' })
  return { appDb, jobsDb }
}

describe('maybeFireWeekly', () => {
  it('일요일 아님 → skipped', async () => {
    const { appDb, jobsDb } = makeDbs()
    const send = vi.fn(async () => ({ ok: true }))
    const build = vi.fn(async () => ({ text: 'x' }))
    // 2026-06-20 = 토요일
    const r = await maybeFireWeekly(appDb, jobsDb, true, '21:00', '21:00', '2026-06-20', { build, send })
    expect(r).toBe('skipped'); expect(send).not.toHaveBeenCalled()
  })
  it('일요일 21:00 → 1회 발송, 재호출은 dedup으로 skipped', async () => {
    const { appDb, jobsDb } = makeDbs()
    const send = vi.fn(async () => ({ ok: true }))
    const build = vi.fn(async () => ({ text: '리포트' }))
    // 2026-06-21 = 일요일
    const r1 = await maybeFireWeekly(appDb, jobsDb, true, '21:00', '21:00', '2026-06-21', { build, send })
    const r2 = await maybeFireWeekly(appDb, jobsDb, true, '21:00', '21:00', '2026-06-21', { build, send })
    expect(r1).toBe('sent'); expect(r2).toBe('skipped'); expect(send).toHaveBeenCalledTimes(1)
  })
})
