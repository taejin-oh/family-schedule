import { drizzle } from 'drizzle-orm/better-sqlite3'
import { and, eq } from 'drizzle-orm'
import * as schema from '@/server/db/schema'
import type { ScheduleSlot } from '@/server/db/schema'
import type { VisionProvider } from '@/server/llm/types'

/** Normalize title for duplicate detection — case + whitespace insensitive. */
function normalizeTitle(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim()
}

type AppDb = ReturnType<typeof drizzle<typeof schema>>

type ScheduleRule = { slots: ScheduleSlot[] } | null

function computeNextSession(rule: ScheduleRule, from: Date): Date | null {
  if (!rule || !rule.slots || !Array.isArray(rule.slots)) return null
  const dayMap: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 }
  const wanted = new Set(rule.slots.map((s: ScheduleSlot) => dayMap[s?.day]).filter((n: number | undefined): n is number => typeof n === 'number'))
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

  // State guard: only process batches in pending or processing state.
  // Silently skip committed/ready/failed to prevent double-processing.
  if (batch.status !== 'pending' && batch.status !== 'processing') {
    console.log(`[runner] skip batch ${batch.id} — status=${batch.status}`)
    return
  }

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
      userHint: batch.userHint,
      model: payload.model,
    })

    // Deduplicate against existing committed items in the same academy
    // (any state — active or done). Key = normalized title + dueDate string.
    // Prevents re-uploading the same file from re-creating items the user
    // already has (especially already-done ones).
    const existingCommitted = db
      .select({
        title: schema.homeworkItems.title,
        dueDate: schema.homeworkItems.dueDate,
      })
      .from(schema.homeworkItems)
      .where(
        and(
          eq(schema.homeworkItems.academyId, batch.academyId),
          eq(schema.homeworkItems.isCommitted, true),
        ),
      )
      .all()
    const existingKeys = new Set(
      existingCommitted.map((e) => `${normalizeTitle(e.title)}|${e.dueDate ?? ''}`),
    )
    const dedupedItems = result.items.filter((it) => {
      const key = `${normalizeTitle(it.title)}|${it.dueDate ?? ''}`
      return !existingKeys.has(key)
    })
    const skippedCount = result.items.length - dedupedItems.length

    db.transaction((tx) => {
      tx.update(schema.homeworkBatches).set({
        status: 'ready',
        rawResponse: result.rawResponse,
        modelUsed: result.modelUsed,
        providerUsed: provider.name,
      }).where(eq(schema.homeworkBatches.id, batch.id)).run()

      if (dedupedItems.length > 0) {
        tx.insert(schema.homeworkItems).values(dedupedItems.map((it) => {
          const photoId = (it.sourcePhotoIndex != null && it.sourcePhotoIndex >= 0 && it.sourcePhotoIndex < photos.length)
            ? photos[it.sourcePhotoIndex].id
            : null
          return {
            batchId: batch.id,
            academyId: batch.academyId,
            title: it.title,
            notes: it.notes ?? null,
            dueDate: it.dueDate,
            source: 'ai' as const,
            aiOriginalTitle: it.title,
            confidence: it.confidence ?? null,
            sourcePhotoId: photoId,
            isCommitted: false,
          }
        })).run()
      }
    })
    void skippedCount   // available for future UI surface; currently silent
  } catch (e: unknown) {
    db.update(schema.homeworkBatches).set({
      status: 'failed',
      failureReason: e instanceof Error ? e.message : String(e),
    }).where(eq(schema.homeworkBatches.id, batch.id)).run()
    throw e
  }
}
