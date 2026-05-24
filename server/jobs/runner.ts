import { drizzle } from 'drizzle-orm/better-sqlite3'
import { eq } from 'drizzle-orm'
import * as schema from '@/server/db/schema'
import type { VisionProvider } from '@/server/llm/types'

type AppDb = ReturnType<typeof drizzle<typeof schema>>

function computeNextSession(rule: any, from: Date): Date | null {
  if (!rule || !rule.slots || !Array.isArray(rule.slots)) return null
  const dayMap: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 }
  const wanted = new Set(rule.slots.map((s: any) => dayMap[s?.day]).filter((n: number | undefined): n is number => typeof n === 'number'))
  if (wanted.size === 0) return null
  for (let i = 1; i <= 14; i++) {
    const d = new Date(from); d.setDate(d.getDate() + i)
    if (wanted.has(d.getDay())) return d
  }
  return null
}

export async function processExtractHomework(
  db: AppDb,
  provider: VisionProvider,
  payload: { batchId: number; model?: string },
) {
  const batch = db.select().from(schema.homeworkBatches).where(eq(schema.homeworkBatches.id, payload.batchId)).get()
  if (!batch) throw new Error(`Batch ${payload.batchId} not found`)
  const academy = db.select().from(schema.academies).where(eq(schema.academies.id, batch.academyId)).get()
  if (!academy) throw new Error(`Academy ${batch.academyId} not found`)
  const photos = db.select().from(schema.homeworkPhotos).where(eq(schema.homeworkPhotos.batchId, batch.id)).all()

  db.update(schema.homeworkBatches).set({ status: 'processing' }).where(eq(schema.homeworkBatches.id, batch.id)).run()

  try {
    const result = await provider.extractHomework({
      imagePaths: photos.map((p) => p.resizedPath),
      academy: {
        name: academy.name,
        subject: academy.subject,
        nextSessionAt: computeNextSession(academy.scheduleRule, new Date()),
      },
      model: payload.model,
    })

    db.transaction((tx) => {
      tx.update(schema.homeworkBatches).set({
        status: 'ready',
        rawResponse: result.rawResponse,
        modelUsed: result.modelUsed,
        providerUsed: provider.name,
      }).where(eq(schema.homeworkBatches.id, batch.id)).run()

      if (result.items.length > 0) {
        tx.insert(schema.homeworkItems).values(result.items.map((it) => ({
          batchId: batch.id,
          academyId: batch.academyId,
          title: it.title,
          dueDate: it.dueDate,
          source: 'ai' as const,
          aiOriginalTitle: it.title,
          isCommitted: false,
        }))).run()
      }
    })
  } catch (e: any) {
    db.update(schema.homeworkBatches).set({
      status: 'failed',
      failureReason: e?.message ?? String(e),
    }).where(eq(schema.homeworkBatches.id, batch.id)).run()
    throw e
  }
}
