import { drizzle } from 'drizzle-orm/better-sqlite3'
import { and, eq } from 'drizzle-orm'
import * as schema from '@/server/db/schema'
import type { ScheduleSlot } from '@/server/db/schema'
import type { VisionProvider } from '@/server/llm/types'
import { localDateIso } from '@/server/util/date'

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

    // Auto-fill missing dueDate with next academy session date (Phase 0 spec).
    // AI가 dueDate를 못 찾으면 학원 schedule rule을 보고 다음 세션 일자로 채움.
    // schedule rule이 없는 학원은 dueDate null 유지 — review에서 수동 입력.
    const nextSession = computeNextSession(academy.scheduleRule, new Date())

    // dedup + batch update + items insert를 한 transaction에서 수행한다.
    // (1) 기존 academy의 committed items에 대한 SELECT를 트랜잭션 안에서 다시
    //     읽어 SELECT-then-INSERT 사이 다른 호출자가 같은 (normalized title +
    //     dueDate)를 commit한 경우(TOCTOU)도 일관되게 차단.
    // (2) AI가 같은 batch 안에서 같은 항목을 변형(대소문자/공백)으로 두 번 뱉는
    //     경우도 seenInThisBatch Set으로 dedup.
    db.transaction((tx) => {
      const existingCommitted = tx
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

      const seenInThisBatch = new Set<string>()
      const dedupedItems = result.items.filter((it) => {
        const key = `${normalizeTitle(it.title)}|${it.dueDate ?? ''}`
        if (existingKeys.has(key) || seenInThisBatch.has(key)) return false
        seenInThisBatch.add(key)
        return true
      })
      const skippedCount = result.items.length - dedupedItems.length
      if (skippedCount > 0) {
        console.log(`[runner] batch#${batch.id} deduped ${skippedCount} item(s) (existing+same-batch)`)
      }

      const filledItems = dedupedItems.map((it) => {
        if (it.dueDate || !nextSession) return it
        return { ...it, dueDate: localDateIso(nextSession) }
      })

      tx.update(schema.homeworkBatches).set({
        status: 'ready',
        rawResponse: result.rawResponse,
        modelUsed: result.modelUsed,
        providerUsed: provider.name,
      }).where(eq(schema.homeworkBatches.id, batch.id)).run()

      if (filledItems.length > 0) {
        tx.insert(schema.homeworkItems).values(filledItems.map((it) => {
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
            confidenceReason: it.confidenceReason ?? null,
            sourcePhotoId: photoId,
            isCommitted: false,
          }
        })).run()
      }
    })
  } catch (e: unknown) {
    db.update(schema.homeworkBatches).set({
      status: 'failed',
      failureReason: e instanceof Error ? e.message : String(e),
    }).where(eq(schema.homeworkBatches.id, batch.id)).run()
    throw e
  }
}
