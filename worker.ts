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
import { eq } from 'drizzle-orm'

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

async function main() {
  const appDb = openDb(resolve('data/app.db'), resolve('server/db/migrations'), appSchema)
  const jobsDb = openDb(resolve('data/jobs.db'), resolve('server/jobs/migrations'), jobsSchema)
  // ensure settings row
  appDb.insert(appSchema.appSettings).values({ id: 1 }).onConflictDoNothing().run()

  // Recover any stale running jobs from a previous crashed worker
  const reaped = await reapStaleRunningJobs(jobsDb, 10 * 60 * 1000)
  if (reaped > 0) console.log(`[worker] reaped ${reaped} stale running job(s) on startup`)

  console.log('[worker] started, polling every 1s')

  let pollCount = 0
  while (true) {
    pollCount++
    // Periodically reap stale jobs (~every 60 polls = ~60s)
    if (pollCount % 60 === 0) {
      await reapStaleRunningJobs(jobsDb, 10 * 60 * 1000)
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
