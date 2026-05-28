import { and, eq, ne } from 'drizzle-orm'
import { notFound, redirect } from 'next/navigation'
import { getDb } from '@/server/db/client'
import * as schema from '@/server/db/schema'
import { localDateIso } from '@/server/util/date'
import { ReviewForm } from './review-form'

const SIM_THRESHOLD = 0.4

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    // Keep Korean (가-힣), Latin letters/digits, and Hangul syllables. Replace other punctuation/symbols with space.
    .replace(/[^\p{L}\p{N}\s가-힣]/gu, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 0)
}

function jaccard(a: string[], b: string[]): number {
  const sa = new Set(a)
  const sb = new Set(b)
  if (sa.size === 0 && sb.size === 0) return 0
  let inter = 0
  for (const x of sa) if (sb.has(x)) inter++
  const union = sa.size + sb.size - inter
  return union === 0 ? 0 : inter / union
}

type ExistingItem = {
  id: number
  title: string
  dueDate: string | null
  doneAt: Date | null
}

function findSimilar(draftTitle: string, draftDueDate: string | null, existing: ExistingItem[]): {
  title: string
  dueDate: string | null
  doneAt: Date | null
  score: number
} | null {
  const draftTokens = tokenize(draftTitle)
  if (draftTokens.length === 0) return null
  let best: { item: ExistingItem; score: number } | null = null
  for (const e of existing) {
    let score = jaccard(draftTokens, tokenize(e.title))
    // Small boost if dueDate also matches
    if (draftDueDate && draftDueDate === e.dueDate) score += 0.15
    if (score >= SIM_THRESHOLD && (!best || score > best.score)) {
      best = { item: e, score }
    }
  }
  if (!best) return null
  return {
    title: best.item.title,
    dueDate: best.item.dueDate,
    doneAt: best.item.doneAt,
    score: Math.min(best.score, 1),
  }
}

export default async function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const t0 = performance.now()
  const { id } = await params
  const batchId = Number(id)
  const batch = getDb().select().from(schema.homeworkBatches).where(eq(schema.homeworkBatches.id, batchId)).get()
  if (!batch) notFound()
  if (batch.status === 'pending' || batch.status === 'processing') redirect(`/homework/batches/${batchId}`)
  const isReadOnly = batch.status === 'committed'

  const items = getDb().select().from(schema.homeworkItems).where(eq(schema.homeworkItems.batchId, batchId)).all()
  const photos = getDb().select().from(schema.homeworkPhotos).where(eq(schema.homeworkPhotos.batchId, batchId)).all()
  // Build a set of photo ids for fast lookup
  const photoIds = new Set(photos.map((p) => p.id))
  const academy = getDb().select().from(schema.academies).where(eq(schema.academies.id, batch.academyId)).get()

  // Existing committed items for this academy (any state). Used to flag fuzzy duplicates
  // in the review UI. The strict (normalized title + dueDate) dedup at extraction time
  // already prevents obvious duplicates from reaching this screen; this catches the
  // softer "LLM phrased it slightly differently" cases.
  // items가 비어있으면 findSimilar 호출 자체가 안 됨 → 쿼리 skip (수동 추가 batch 진입 시 절약).
  const existingCommitted: ExistingItem[] = items.length === 0 ? [] : getDb()
    .select({
      id: schema.homeworkItems.id,
      title: schema.homeworkItems.title,
      dueDate: schema.homeworkItems.dueDate,
      doneAt: schema.homeworkItems.doneAt,
    })
    .from(schema.homeworkItems)
    .where(
      and(
        eq(schema.homeworkItems.academyId, batch.academyId),
        eq(schema.homeworkItems.isCommitted, true),
        ne(schema.homeworkItems.batchId, batchId),    // exclude items already committed within this very batch (only matters if you revisit /review after partial commit — defensive)
      ),
    )
    .all()

  console.log(`[perf] /review batchId=${batchId} items=${items.length} photos=${photos.length} existing=${existingCommitted.length} fetch=${(performance.now() - t0).toFixed(1)}ms`)

  return (
    <div className="space-y-4">
      <header className="px-1 pt-2 pb-1 flex items-end justify-between gap-2">
        <div>
          <h1 className="text-[30px] leading-tight font-bold tracking-tight">추출 결과 검토</h1>
          {academy && (
            <div className="text-sm text-muted-foreground mt-0.5 inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: academy.color }} />
              {academy.name}
            </div>
          )}
        </div>
      </header>
      <ReviewForm
        batchId={batchId}
        todayIso={localDateIso()}
        initial={items.map((it) => ({
          id: it.id,
          title: it.title,
          notes: it.notes,
          dueDate: it.dueDate,
          source: it.source,
          confidence: it.confidence ?? null,
          confidenceReason: it.confidenceReason ?? null,
          sourcePhotoId: (it.sourcePhotoId != null && photoIds.has(it.sourcePhotoId)) ? it.sourcePhotoId : null,
          similar: findSimilar(it.title, it.dueDate, existingCommitted),
        }))}
        photos={photos.map((p) => ({ id: p.id, isPdf: p.resizedPath.toLowerCase().endsWith('.pdf') }))}
        currentHint={batch.userHint}
        isReadOnly={isReadOnly}
      />
    </div>
  )
}
