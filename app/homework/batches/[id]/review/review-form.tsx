'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { FileText, X, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react'
import { updateDraftItem, addDraftItem, deleteDraftItem, commitBatch, rerunBatch } from '@/server/actions/homework'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { LoadingDots } from '@/components/loading-dots'
import { cn } from '@/lib/utils'

type SimilarMatch = {
  title: string
  dueDate: string | null
  doneAt: Date | null
  score: number
}
type Item = {
  id: number
  title: string
  notes: string | null
  dueDate: string | null
  source: 'ai' | 'manual'
  confidence?: number | null
  confidenceReason?: string | null
  sourcePhotoId?: number | null
  similar?: SimilarMatch | null
}
type Photo = { id: number; isPdf: boolean; name?: string | null }

export function ReviewForm({
  batchId, todayIso, initial, photos, currentHint, isReadOnly = false,
}: {
  batchId: number
  todayIso: string
  initial: Item[]
  photos: Photo[]
  currentHint: string | null
  isReadOnly?: boolean
}) {
  const router = useRouter()
  const [items, setItems] = useState<Item[]>(initial)
  const [busy, setBusy] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newNotes, setNewNotes] = useState('')
  const [newDue, setNewDue] = useState<string>('')
  const [newHint, setNewHint] = useState(currentHint ?? '')
  const [rerunError, setRerunError] = useState<string | null>(null)
  const [commitError, setCommitError] = useState<string | null>(null)

  // 검토 페이지 collapsed-by-default. 사용자 주의가 필요한 항목(유사 경고 / 확신 낮음 /
  // 빈 제목)은 자동으로 펼친 상태로 시작 — 즉시 결정/수정해야 하니까.
  const [expandedIds, setExpandedIds] = useState<Set<number>>(() => {
    const s = new Set<number>()
    for (const it of initial) {
      if (it.similar) s.add(it.id)
      if (it.confidence != null && it.confidence < 0.6) s.add(it.id)
      if (!it.title.trim()) s.add(it.id)
    }
    return s
  })
  function toggleExpand(id: number) {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Lookup photo metadata by id (so we can decide thumbnail vs PDF icon per item).
  const photoMap = new Map(photos.map((p) => [p.id, p]))

  function patchLocal(id: number, p: Partial<Item>) {
    setItems((cur) => cur.map((x) => (x.id === id ? { ...x, ...p } : x)))
  }

  async function persist(id: number, p: { title?: string; notes?: string | null; dueDate?: string | null }) {
    await updateDraftItem(id, p)
  }

  async function remove(id: number) {
    await deleteDraftItem(id)
    setItems((cur) => cur.filter((x) => x.id !== id))
  }

  async function add() {
    if (!newTitle.trim()) return
    const res = await addDraftItem(batchId, {
      title: newTitle.trim(),
      notes: newNotes.trim() || null,
      dueDate: newDue || null,
    })
    if (res.ok) {
      setItems((cur) => [
        ...cur,
        {
          id: res.data.id,
          title: newTitle.trim(),
          notes: newNotes.trim() || null,
          dueDate: newDue || null,
          source: 'manual',
          similar: null,
        },
      ])
      setNewTitle('')
      setNewNotes('')
      setNewDue('')
    }
  }

  async function commit() {
    setBusy(true)
    setCommitError(null)
    try {
      const res = await commitBatch(batchId)
      if (!res.ok) {
        setCommitError(res.error ?? '확정 실패')
        setBusy(false)
        return
      }
      // 정상 commit 후 홈으로. router.refresh로 server cache flush + push로 navigate.
      router.refresh()
      router.push('/')
      // 5초 안에 페이지가 떠나지 않으면 hard fallback. (드물지만 router.push가
      // 어떤 이유로 navigation을 시작 못 하는 경우 사용자가 영원히 갇히지 않게.)
      window.setTimeout(() => {
        if (window.location.pathname.startsWith('/homework/batches/')) {
          window.location.href = '/'
        }
      }, 5000)
    } catch (e) {
      setCommitError(e instanceof Error ? e.message : '확정 실패')
      setBusy(false)
    }
  }

  async function rerun() {
    setBusy(true)
    setRerunError(null)
    const res = await rerunBatch(batchId, { userHint: newHint || null })
    if (!res.ok) {
      setRerunError(res.error)
      setBusy(false)
      return
    }
    router.push('/homework/batches/' + res.data.batchId)
  }

  // grid-cols-1 명시 필수: bare `grid`는 모바일에서 컬럼이 auto(max-content)라
  // 긴 제목/메모가 컬럼을 부풀려 화면이 잘림. grid-cols-1=minmax(0,1fr)로 폭 제약.
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div className="md:col-span-2 min-w-0 space-y-4">
        {isReadOnly && (
          <div className="rounded-xl bg-muted px-4 py-3 text-sm text-muted-foreground">
            🔒 이미 확정된 batch입니다. 항목은 읽기 전용 — 변경하려면 「다시 추출하기」로 새 batch를 만들어주세요.
          </div>
        )}

        {/* Section: 추출 항목 */}
        <section className="space-y-2">
          <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-1 pt-1">
            추출 항목 {items.length > 0 && `· ${items.length}`}
          </h2>

          {items.length === 0 ? (
            <Card className="p-6 text-center text-muted-foreground text-sm border-dashed">
              추출된 항목이 없습니다. 아래에서 수동으로 추가하세요.
            </Card>
          ) : (
            <div className="space-y-2">
              {items.map((it) => {
                const photo = it.sourcePhotoId != null ? photoMap.get(it.sourcePhotoId) : null
                const isExpanded = expandedIds.has(it.id)

                // Collapsed: 한 줄 — AI/수동, 경고 배지, 제목, 마감, 펼침 화살표.
                if (!isExpanded) {
                  return (
                    <Card
                      key={it.id}
                      className={cn(
                        'p-3 cursor-pointer hover:bg-accent/30 transition-colors',
                        it.similar && 'ring-2 ring-amber-300/60',
                      )}
                      onClick={() => toggleExpand(it.id)}
                    >
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <span
                            className={cn(
                              'inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-semibold',
                              it.source === 'ai' ? 'bg-blue-100 text-blue-700' : 'bg-muted text-muted-foreground',
                            )}
                          >
                            {it.source === 'ai' ? 'AI' : '수동'}
                          </span>
                          {it.confidence != null && it.confidence < 0.6 && (
                            <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-semibold bg-amber-100 text-amber-800">
                              {Math.round(it.confidence * 100)}%
                            </span>
                          )}
                          {it.similar && (
                            <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-semibold bg-amber-100 text-amber-800">
                              ⚠️
                            </span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className={cn(
                            'text-sm font-medium truncate',
                            !it.title.trim() && 'text-muted-foreground italic',
                          )}>
                            {it.title.trim() || '(빈 제목)'}
                          </div>
                        </div>
                        <div className="text-[11px] text-muted-foreground tabular-nums flex-shrink-0">
                          {it.dueDate ?? '날짜 X'}
                        </div>
                        <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden />
                      </div>
                    </Card>
                  )
                }

                // Expanded: 모든 편집 UI.
                return (
                  <Card
                    key={it.id}
                    className={cn(
                      'p-4 gap-3',
                      it.similar && 'ring-2 ring-amber-300/60',
                    )}
                  >
                    {/* Badges row + collapse + delete */}
                    <div className="flex items-start gap-2">
                      <div className="flex-1 flex items-center gap-1.5 flex-wrap">
                        <span
                          className={cn(
                            'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold',
                            it.source === 'ai' ? 'bg-blue-100 text-blue-700' : 'bg-muted text-muted-foreground',
                          )}
                        >
                          {it.source === 'ai' ? 'AI 추출' : '수동 추가'}
                        </span>
                        {it.confidence != null && it.confidence < 0.6 && (
                          <span
                            className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold bg-amber-100 text-amber-800"
                            title={it.confidenceReason ?? undefined}
                          >
                            확신 낮음 {Math.round(it.confidence * 100)}%
                            {it.confidenceReason && <span className="ml-1 font-normal opacity-80">· {it.confidenceReason}</span>}
                          </span>
                        )}
                        {!isReadOnly && (it.dueDate == null || it.dueDate < todayIso) && (
                          <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold bg-muted text-muted-foreground">
                            날짜 의심
                          </span>
                        )}
                        {it.similar && (
                          <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold bg-amber-100 text-amber-800">
                            ⚠️ 유사 {Math.round(it.similar.score * 100)}%
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => toggleExpand(it.id)}
                        aria-label="접기"
                        className="shrink-0 h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                      >
                        <ChevronUp className="h-4 w-4" aria-hidden />
                      </button>
                      {!isReadOnly && (
                        <button
                          type="button"
                          onClick={() => remove(it.id)}
                          aria-label="삭제"
                          className="shrink-0 h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>

                    {/* Similar item warning */}
                    {it.similar && (
                      <div className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-md p-2.5 space-y-2">
                        <div>
                          <div className="font-medium">이미 등록된 비슷한 항목</div>
                          <div className="break-words mt-0.5">
                            “{it.similar.title}”
                            {it.similar.dueDate && <span className="text-muted-foreground"> · ~{it.similar.dueDate}</span>}
                            {it.similar.doneAt && <span className="text-green-700"> · ✓ 완료됨</span>}
                          </div>
                        </div>
                        {!isReadOnly && (
                          <div className="flex gap-1.5 pt-1">
                            <button
                              type="button"
                              onClick={() => patchLocal(it.id, { similar: null })}
                              className="px-2.5 py-1 rounded text-[11px] font-medium bg-white text-amber-900 border border-amber-300 hover:bg-amber-100 transition-colors"
                            >
                              다른 항목이에요
                            </button>
                            <button
                              type="button"
                              onClick={() => remove(it.id)}
                              className="px-2.5 py-1 rounded text-[11px] font-medium bg-amber-700 text-white hover:bg-amber-800 transition-colors"
                            >
                              이거랑 같아요 (삭제)
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Content row: thumbnail + main */}
                    <div className="flex gap-3">
                      {/* Source thumbnail (only for image photos — PDFs get an icon) */}
                      {photo && (
                        <a
                          href={`/api/photo?id=${photo.id}&variant=orig`}
                          target="_blank"
                          rel="noreferrer"
                          className="shrink-0"
                          title={`${photo.name?.trim() || (photo.isPdf ? 'PDF' : '사진')} · 원본 열기`}
                        >
                          {photo.isPdf ? (
                            <div className="w-16 h-16 rounded-lg bg-muted ring-1 ring-foreground/10 flex items-center justify-center text-muted-foreground">
                              <FileText className="h-7 w-7" aria-hidden />
                            </div>
                          ) : (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img
                              src={`/api/photo?id=${photo.id}`}
                              alt={photo.name?.trim() || '원본 사진'}
                              loading="lazy"
                              decoding="async"
                              className="w-16 h-16 object-cover rounded-lg ring-1 ring-foreground/10"
                            />
                          )}
                        </a>
                      )}

                      {/* Main content */}
                      <div className="flex-1 min-w-0 space-y-2">
                        <Textarea
                          value={it.title}
                          placeholder="숙제 내용"
                          onChange={(e) => !isReadOnly && patchLocal(it.id, { title: e.target.value })}
                          onBlur={(e) => !isReadOnly && persist(it.id, { title: e.target.value })}
                          rows={1}
                          className="resize-y text-[15px] font-medium leading-snug min-h-[36px] py-1.5"
                          disabled={isReadOnly}
                        />
                        <Textarea
                          value={it.notes ?? ''}
                          placeholder="상세 메모 (책 이름, 단원, 페이지 등)"
                          onChange={(e) => !isReadOnly && patchLocal(it.id, { notes: e.target.value })}
                          onBlur={(e) => !isReadOnly && persist(it.id, { notes: e.target.value || null })}
                          rows={2}
                          className="resize-y text-sm text-muted-foreground leading-snug min-h-[48px]"
                          disabled={isReadOnly}
                        />
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">마감일</span>
                          <Input
                            type="date"
                            value={it.dueDate ?? ''}
                            onChange={(e) => {
                              if (isReadOnly) return
                              const v = e.target.value || null
                              patchLocal(it.id, { dueDate: v })
                              persist(it.id, { dueDate: v })
                            }}
                            className="h-8 w-auto text-sm"
                            disabled={isReadOnly}
                          />
                        </div>
                      </div>
                    </div>
                  </Card>
                )
              })}
            </div>
          )}
        </section>

        {/* Section: 수동 추가 */}
        {!isReadOnly && (
          <section className="space-y-2">
            <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-1 pt-1">
              수동 추가
            </h2>
            <Card className="p-4 gap-3 border-dashed">
              <Textarea
                placeholder="숙제 내용 (예: 수학익힘책 p.20-30)"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                rows={1}
                className="resize-y text-[15px] font-medium leading-snug min-h-[36px] py-1.5"
              />
              <Textarea
                placeholder="상세 메모 (선택)"
                value={newNotes}
                onChange={(e) => setNewNotes(e.target.value)}
                rows={2}
                className="resize-y text-sm text-muted-foreground leading-snug min-h-[48px]"
              />
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 flex-1">
                  <span className="text-xs text-muted-foreground">마감일</span>
                  <Input
                    type="date"
                    value={newDue}
                    onChange={(e) => setNewDue(e.target.value)}
                    className="h-8 w-auto text-sm"
                  />
                </div>
                <Button
                  type="button"
                  onClick={add}
                  variant="secondary"
                  size="sm"
                  disabled={!newTitle.trim()}
                >
                  + 추가
                </Button>
              </div>
            </Card>
          </section>
        )}

        {/* Section: 다시 추출 */}
        {!isReadOnly && (
          <details className="group">
            <summary className="cursor-pointer select-none px-1 text-sm text-muted-foreground hover:text-foreground list-none flex items-center gap-1.5 pt-2">
              <RefreshCw className="h-3.5 w-3.5" aria-hidden />
              <span>추출 결과가 이상한가요?</span>
              <span className="ml-auto text-xs group-open:hidden">펼치기</span>
              <span className="ml-auto text-xs hidden group-open:inline">접기</span>
            </summary>
            <Card className="mt-2 p-4 gap-3 border-dashed">
              <p className="text-xs text-muted-foreground">
                힌트를 수정해서 다시 추출할 수 있어요. 이전 batch는 그대로 보존됩니다.
              </p>
              <Textarea
                placeholder="예: 수학 숙제 알림장, 날짜와 과목명 포함"
                value={newHint}
                onChange={(e) => setNewHint(e.target.value)}
                rows={3}
                className="resize-y text-sm"
              />
              <p className="text-xs text-muted-foreground">모델 변경은 설정 페이지에서</p>
              {rerunError && <p className="text-xs text-destructive">{rerunError}</p>}
              <Button type="button" onClick={rerun} disabled={busy} variant="secondary" className="w-full">
                🔁 다시 추출
              </Button>
            </Card>
          </details>
        )}

        {/* Bottom action — confirm */}
        {!isReadOnly && (
          <div className="space-y-2 pt-1">
            <Button
              onClick={commit}
              disabled={busy || items.length === 0}
              className="w-full h-12 text-base font-semibold rounded-xl"
            >
              {busy ? <>확정 중<LoadingDots /></> : `✅ ${items.length}개 항목 확정`}
            </Button>
            {commitError && (
              <p className="text-sm text-destructive whitespace-pre-wrap break-words px-1">
                {commitError}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Sidebar — 원본 파일 (desktop right / mobile bottom via column order) */}
      <aside className="space-y-2">
        <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-1 pt-1">
          원본 파일 {photos.length > 0 && `· ${photos.length}`}
        </h2>
        <div className="space-y-2">
          {photos.map((p, i) => {
            // 클릭 시 업로드 원본을 직접 열기 (variant=orig). 썸네일은 가벼운 resized 사용.
            const origHref = `/api/photo?id=${p.id}&variant=orig`
            const thumbHref = `/api/photo?id=${p.id}`
            const label = p.name?.trim() || (p.isPdf ? `PDF ${i + 1}` : `사진 ${i + 1}`)
            if (p.isPdf) {
              return (
                <a key={p.id} href={origHref} target="_blank" rel="noreferrer" className="block">
                  <Card className="p-3 gap-2 hover:bg-accent/40 transition-colors">
                    <div className="flex items-center gap-2 text-sm">
                      <FileText className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden />
                      <span className="font-medium truncate" title={label}>{label}</span>
                      <span className="ml-auto text-xs text-muted-foreground shrink-0">열기 ↗</span>
                    </div>
                  </Card>
                </a>
              )
            }
            return (
              <a key={p.id} href={origHref} target="_blank" rel="noreferrer" className="block space-y-1" title={`${label} · 원본 열기`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={thumbHref}
                  alt={label}
                  loading="lazy"
                  decoding="async"
                  className="w-full rounded-xl ring-1 ring-foreground/10"
                />
                <div className="text-xs text-muted-foreground truncate px-1" title={label}>{label}</div>
              </a>
            )
          })}
        </div>
      </aside>
    </div>
  )
}
