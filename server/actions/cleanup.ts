'use server'

import { drizzle } from 'drizzle-orm/better-sqlite3'
import { revalidatePath } from 'next/cache'
import * as schema from '@/server/db/schema'
import { getDb } from '@/server/db/client'
import { runBatchCleanup, type CleanupResult } from '@/server/util/batch-cleanup'

type AppDb = ReturnType<typeof drizzle<typeof schema>>
type Ctx = { db?: AppDb }

export async function runManualCleanup(ctx: Ctx = {}): Promise<CleanupResult> {
  const db = ctx.db ?? getDb()
  const res = runBatchCleanup(db)
  revalidatePath('/homework/upload')
  revalidatePath('/admin/settings')
  return res
}
