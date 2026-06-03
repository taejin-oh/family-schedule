import { and, eq, ne } from 'drizzle-orm'
import { notFound, redirect } from 'next/navigation'
import { getDb } from '@/server/db/client'
import * as schema from '@/server/db/schema'
import { localDateIso } from '@/server/util/date'
import { ReviewForm } from './review-form'
import { logServerEvent } from '@/server/log/server-event'

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
  notes: string | null
  dueDate: string | null
  doneAt: Date | null
}

/**
 * 항목의 교재(책) 시그니처 추출. AI가 notes에 "교재: <책이름>. ..." 형식으로 넣는다.
 * 못 찾으면 null → 책을 알 수 없으므로 책 게이트를 적용하지 않는다.
 */
function extractBook(notes: string | null): string | null {
  if (!notes) return null
  // "교재: Debate Pro Junior 1. ..." / "교재：..." → 책 이름 (첫 마침표/중점/줄바꿈 전까지)
  const m = notes.match(/교재\s*[:：]\s*([^.\n·]+)/)
  if (m && m[1].trim()) return m[1].trim()
  // "myON: ...", "Write Right 3 - ..." 처럼 앞쪽 라벨형 책 이름
  const m2 = notes.match(/^\s*([A-Za-z][\w'’ -]{1,40}?)\s*[:：]/)
  if (m2 && m2[1].trim()) return m2[1].trim()
  return null
}

/** 두 책이 같은 책인지. 한쪽이라도 책을 모르면(null) 게이트하지 않고 true. */
function sameBook(a: string | null, b: string | null): boolean {
  if (!a || !b) return true
  const ta = tokenize(a), tb = tokenize(b)
  if (ta.length === 0 || tb.length === 0) return true
  return jaccard(ta, tb) >= 0.5   // 책 토큰 절반 이상 겹치면 같은 책
}

function findSimilar(
  draftTitle: string,
  draftNotes: string | null,
  draftDueDate: string | null,
  existing: ExistingItem[],
): {
  title: string
  dueDate: string | null
  doneAt: Date | null
  score: number
} | null {
  const draftTokens = tokenize(draftTitle)
  if (draftTokens.length === 0) return null
  const draftBook = extractBook(draftNotes)
  let best: { item: ExistingItem; score: number } | null = null
  for (const e of existing) {
    // 책이 다르면 다른 숙제로 간주 — 유사 후보에서 제외 (제목만 비슷해도 무시).
    if (!sameBook(draftBook, extractBook(e.notes))) continue
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
  // eslint-disable-next-line react-hooks/purity -- intentional perf measurement
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
      notes: schema.homeworkItems.notes,
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

  await logServerEvent({
    category: 'perf',
    event: 'review.fetch',
    props: {
      batchId,
      items: items.length,
      photos: photos.length,
      existing: existingCommitted.length,
      // eslint-disable-next-line react-hooks/purity -- intentional perf measurement
      ms: Math.round(performance.now() - t0),
    },
  })

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
          similar: findSimilar(it.title, it.notes, it.dueDate, existingCommitted),
        }))}
        photos={photos.map((p) => ({ id: p.id, isPdf: p.resizedPath.toLowerCase().endsWith('.pdf'), name: p.originalName }))}
        currentHint={batch.userHint}
        isReadOnly={isReadOnly}
      />
    </div>
  )
}
