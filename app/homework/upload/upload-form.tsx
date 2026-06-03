'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Camera, FileText, ImageIcon, RefreshCw, Pencil, X, Loader2 } from 'lucide-react'
import { uploadHomework, rerunBatch, deleteBatch, createEmptyBatch } from '@/server/actions/homework'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useMediaQuery } from '@/lib/use-media-query'
import { cn } from '@/lib/utils'
import { LoadingDots } from '@/components/loading-dots'
import { track } from '@/lib/log/client'
import { BatchCard } from './batch-card'

type Academy = { id: number; name: string; color: string; extractionHint: string | null }

type BatchSummary = {
  id: number
  academyId: number
  capturedAt: Date
  status: 'pending' | 'processing' | 'ready' | 'committed' | 'failed'
  userHint: string | null
  failureReason: string | null
  photoCount: number
  firstPhotoId: number | null
  firstPhotoPath: string | null
  firstPhotoName: string | null
  isPdf: boolean
  itemCount: number
  minDue: string | null
  maxDue: string | null
  archivedAt: Date | null
  photosCleanedAt: Date | null
}

type ReuseSource = {
  batchId: number
  academyId: number
  capturedAt: Date
  userHint: string | null
  photos: { id: number; path: string; isPdf: boolean; name: string | null }[]
}

const STATUS_LABEL: Record<BatchSummary['status'], string> = {
  pending: '대기',
  processing: '분석 중',
  ready: '리뷰 대기',
  committed: '확정됨',
  failed: '실패',
}

function formatDate(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return `${mm}/${dd} ${hh}:${min}`
}

type RelatedBatch = {
  id: number
  capturedAt: Date
  status: BatchSummary['status']
  userHint: string | null
  providerUsed: string | null
  modelUsed: string | null
  failureReason: string | null
  itemCount: number
}

export function UploadForm({
  academies,
  batchesByAcademy,
  hintsByAcademy,
  reuse,
  related,
  initialAcademyId: initialAcademyIdProp,
  mode = null,
}: {
  academies: Academy[]
  batchesByAcademy: Record<number, BatchSummary[]>
  hintsByAcademy: Record<number, string[]>
  reuse: ReuseSource | null
  related: RelatedBatch[]
  initialAcademyId?: number | null
  mode?: 'file' | null
}) {
  const showFileForm = mode === 'file' || reuse !== null
  const showChooser = !showFileForm
  const router = useRouter()
  const [, startDelete] = useTransition()
  const initialAcademyId =
    reuse?.academyId ??
    initialAcademyIdProp ??
    (academies.length === 1 ? academies[0].id : null)

  const [academyId, setAcademyId] = useState<number | null>(initialAcademyId)
  const [hint, setHint] = useState<string>(
    reuse?.userHint ??
    (academyId !== null ? academies.find((a) => a.id === academyId)?.extractionHint ?? '' : '')
  )
  const [files, setFiles] = useState<File[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const isCoarsePointer = useMediaQuery('(pointer: coarse)')
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const galleryInputRef = useRef<HTMLInputElement>(null)

  // 이미지 파일은 미리보기 URL을 만들어두고, files 배열이 바뀌면 정리. PDF는 null.
  const fileUrls = useMemo(
    () => files.map((f) => (f.type.startsWith('image/') ? URL.createObjectURL(f) : null)),
    [files],
  )
  useEffect(() => {
    return () => {
      fileUrls.forEach((u) => { if (u) URL.revokeObjectURL(u) })
    }
  }, [fileUrls])

  // 학원 선택 직후 review 페이지 client chunk을 즉시 받아둠. 양쪽 mode 모두
  // review 페이지로 도달하므로 양쪽에 도움. 즉시 시작해서 빠른 사용자도 chunk
  // 받을 시간 확보.
  useEffect(() => {
    if (academyId === null) return
    import('@/app/homework/batches/[id]/review/review-form').catch(() => {})
  }, [academyId])

  function appendFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const incoming = Array.from(e.target.files ?? [])
    if (incoming.length === 0) return
    setFiles((prev) => [...prev, ...incoming])
    // input value를 비워서 같은 파일을 다시 선택할 수 있게.
    e.target.value = ''
  }
  function removeFileAt(idx: number) {
    setFiles((prev) => prev.filter((_, i) => i !== idx))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (reuse) {
      setBusy(true)
      const res = await rerunBatch(reuse.batchId, { userHint: hint || null })
      if (!res.ok) { setError(res.error); setBusy(false); return }
      router.push(`/homework/batches/${res.data.batchId}`)
      return
    }

    if (!academyId) { setError('학원을 선택하세요.'); return }
    if (files.length === 0) { setError('파일을 1장 이상 추가하세요.'); return }
    setBusy(true)
    const res = await uploadHomework({ academyId, files, userHint: hint || null })
    if (!res.ok) { setError(res.error); setBusy(false); return }
    router.push(`/homework/batches/${res.data.batchId}`)
  }

  function formatSize(bytes: number): string {
    if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}MB`
    return `${Math.round(bytes / 1024)}KB`
  }

  async function startManual() {
    setError(null)
    if (!academyId) { setError('학원을 선택하세요.'); return }
    track('feature', 'upload_mode_chosen', { mode: 'manual' })
    setBusy(true)
    const t0 = performance.now()
    const res = await createEmptyBatch(academyId)
    const tAction = performance.now() - t0
    if (!res.ok) { setError(res.error); setBusy(false); return }
    const url = `/homework/batches/${res.data.batchId}/review`
    router.prefetch(url)
    router.push(url)
    // router.push는 동기라 자체 시간 측정은 의미 없음 — server action 시간만 기록.
    track('perf', 'startManual', { createEmptyBatch_ms: Math.round(tAction) })
  }

  function handleDeleteBatch(b: BatchSummary, e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    const msg = `이 batch를 삭제할까요?\n\n${formatDate(b.capturedAt)} · ${STATUS_LABEL[b.status]}` +
      (b.itemCount > 0 ? `\n추출된 항목 ${b.itemCount}개도 같이 삭제됩니다.` : '') +
      `\n\n원본 파일은 디스크에 남아있고, 같은 파일을 쓰는 다른 batch엔 영향 없음.`
    if (!window.confirm(msg)) return
    startDelete(async () => {
      await deleteBatch(b.id)
      router.refresh()
    })
  }

  if (academies.length === 0) {
    return (
      <Card className="p-8 text-center text-muted-foreground space-y-3">
        <p>먼저 학원을 등록해야 합니다.</p>
        <Button onClick={() => router.push('/academies/new')}>학원 등록하러 가기</Button>
      </Card>
    )
  }

  const selectedAcademy = academyId !== null ? academies.find((a) => a.id === academyId) : null
  const pastBatches = academyId !== null ? (batchesByAcademy[academyId] ?? []) : []
  const pastHints = academyId !== null ? (hintsByAcademy[academyId] ?? []) : []
  const hasAcademyDefault = !!selectedAcademy?.extractionHint

  return (
    <Card className="p-6">
      <form onSubmit={submit} className="space-y-5">
        {/* Reuse-mode header banner */}
        {reuse && (
          <div className="rounded-lg bg-accent/40 border border-foreground/10 px-3 py-2 text-sm">
            <div className="flex items-center gap-2 font-medium">
              <RefreshCw className="h-4 w-4" aria-hidden />
              이전 batch #{reuse.batchId} 파일로 재분석
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {formatDate(reuse.capturedAt)} 업로드 · {reuse.photos.length}개 파일
              {' · '}
              <Link href="/homework/upload" className="underline hover:text-foreground">
                새 업로드로 전환
              </Link>
            </div>
          </div>
        )}

        {/* Academy chooser (disabled in reuse mode) */}
        <div className="space-y-2">
          <Label>학원</Label>
          <div className="grid grid-cols-2 gap-2">
            {academies.map((a) => {
              const selected = academyId === a.id
              const disabled = reuse !== null && reuse.academyId !== a.id
              return (
                <button
                  type="button"
                  key={a.id}
                  onClick={() => {
                    if (reuse) return
                    setAcademyId(a.id)
                    setHint(a.extractionHint ?? '')
                  }}
                  disabled={disabled}
                  className={cn(
                    'p-3 rounded-xl text-left flex items-center gap-2 transition-colors text-sm font-semibold',
                    selected
                      ? 'bg-foreground text-background'
                      : 'bg-muted hover:bg-accent',
                    disabled && 'opacity-30 cursor-not-allowed'
                  )}
                >
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: a.color }} />
                  <span className="truncate">{a.name}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Two-mode chooser (landing). Hidden once a mode is selected. */}
        {showChooser && academyId !== null && (
          <div className="grid grid-cols-2 gap-2.5">
            <Link
              href={`/homework/upload?mode=file&academy=${academyId}`}
              onClick={() => track('feature', 'upload_mode_chosen', { mode: 'file' })}
              className="p-4 rounded-xl bg-muted hover:bg-accent transition-colors text-left"
            >
              <div className="text-2xl mb-1.5">📷</div>
              <div className="text-sm font-bold">파일 업로드</div>
              <p className="text-xs text-muted-foreground mt-1 leading-snug">
                사진/PDF를 올리면 AI가 자동 추출
              </p>
            </Link>
            <button
              type="button"
              onClick={startManual}
              disabled={busy}
              className="p-4 rounded-xl bg-muted hover:bg-accent transition-colors text-left disabled:opacity-70 disabled:cursor-wait"
            >
              <div className="text-2xl mb-1.5">
                {busy ? <Loader2 className="h-6 w-6 inline animate-spin" aria-hidden /> : <Pencil className="h-6 w-6 inline" aria-hidden />}
              </div>
              <div className="text-sm font-bold">{busy ? '이동 중…' : '수동 추가'}</div>
              <p className="text-xs text-muted-foreground mt-1 leading-snug">
                {busy ? '잠시만요' : '파일 없이 직접 입력하기'}
              </p>
            </button>
          </div>
        )}

        {/* Back to chooser button when in file mode (not reuse) */}
        {mode === 'file' && !reuse && (
          <Link
            href="/homework/upload"
            className="inline-flex items-center text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            ← 다른 방식 선택
          </Link>
        )}

        {/* Past uploads (not in reuse mode) */}
        {showFileForm && !reuse && academyId !== null && pastBatches.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-baseline justify-between">
              <Label>이 학원의 이전 업로드 ({pastBatches.length})</Label>
              {pastBatches.length > 3 && (
                <Link
                  href={`/homework/upload/history?academy=${academyId}`}
                  className="text-xs text-blue-600 hover:underline"
                >
                  전체 보기 →
                </Link>
              )}
            </div>
            <div className="grid grid-cols-1 gap-2">
              {pastBatches.slice(0, 3).map((b) => (
                <BatchCard
                  key={b.id}
                  batch={b}
                  onDelete={(e) => handleDeleteBatch(b, e)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Analysis history (reuse mode only): batches that share this file's photos */}
        {reuse && related.length > 0 && (
          <div className="space-y-2">
            <Label>이 파일의 분석 이력 ({related.length})</Label>
            <div className="rounded-md border bg-card divide-y">
              {related.map((r) => {
                const isCurrent = r.id === reuse.batchId
                return (
                  <div key={r.id} className={cn('p-3 text-xs space-y-1', isCurrent && 'bg-accent/40')}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-muted-foreground tabular-nums">
                        {formatDate(r.capturedAt)}
                        {isCurrent && <span className="ml-2 text-foreground font-medium">(현재 선택됨)</span>}
                      </span>
                      <span
                        className={cn(
                          'px-1.5 py-0.5 rounded text-[10px] shrink-0',
                          r.status === 'committed' && 'bg-green-100 text-green-700',
                          r.status === 'ready' && 'bg-blue-100 text-blue-700',
                          r.status === 'failed' && 'bg-red-100 text-red-700',
                          (r.status === 'pending' || r.status === 'processing') && 'bg-muted text-muted-foreground'
                        )}
                      >
                        {STATUS_LABEL[r.status]}
                      </span>
                    </div>
                    <div className="text-foreground">
                      {r.modelUsed && <span className="text-muted-foreground">{r.modelUsed} · </span>}
                      {r.status === 'failed'
                        ? <span className="text-destructive">실패</span>
                        : <>항목 {r.itemCount}개</>}
                    </div>
                    {r.userHint ? (
                      <div className="text-muted-foreground italic line-clamp-2">
                        “{r.userHint}”
                      </div>
                    ) : (
                      <div className="text-muted-foreground/60 italic">힌트 없음</div>
                    )}
                    {r.failureReason && (
                      <div className="text-destructive line-clamp-2">{r.failureReason}</div>
                    )}
                    {!isCurrent && (
                      <div className="flex gap-2 pt-1">
                        <Link
                          href={`/homework/upload?reuse=${r.id}`}
                          className="text-foreground/80 hover:text-foreground underline underline-offset-2"
                        >
                          이 batch 기준으로
                        </Link>
                        {(r.status === 'ready' || r.status === 'committed') && (
                          <Link
                            href={`/homework/batches/${r.id}/review`}
                            className="text-foreground/80 hover:text-foreground underline underline-offset-2"
                          >
                            {r.status === 'committed' ? '결과 보기' : '리뷰 열기'}
                          </Link>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
            <p className="text-xs text-muted-foreground">
              같은 파일을 기준으로 한 모든 분석 시도. 힌트나 모델만 바꿔서 결과 비교 가능.
            </p>
          </div>
        )}

        {/* File input (hidden in reuse mode, and only shown in file mode) */}
        {showFileForm && !reuse && (
          <div className="space-y-3">
            <Label>파일 (사진 또는 PDF, 1개 이상)</Label>

            {/* 카메라 / 갤러리 진입점 분리. 카메라는 모바일 전용. 두 입력 모두 같은
                files 배열에 누적된다 (iOS Mail의 "Add" 패턴). */}
            <div className={cn('grid gap-2', isCoarsePointer ? 'grid-cols-2' : 'grid-cols-1')}>
              {isCoarsePointer && (
                <button
                  type="button"
                  onClick={() => cameraInputRef.current?.click()}
                  className="flex flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-muted-foreground/25 bg-card hover:bg-accent/40 active:bg-accent/60 transition-colors py-5 px-3"
                >
                  <Camera className="h-7 w-7 text-muted-foreground" aria-hidden />
                  <span className="text-sm font-semibold">📷 카메라로 찍기</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => galleryInputRef.current?.click()}
                className="flex flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-muted-foreground/25 bg-card hover:bg-accent/40 active:bg-accent/60 transition-colors py-5 px-3"
              >
                <ImageIcon className="h-7 w-7 text-muted-foreground" aria-hidden />
                <span className="text-sm font-semibold">🖼️ 파일에서 선택</span>
              </button>
            </div>
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={appendFiles}
              className="sr-only"
            />
            <input
              ref={galleryInputRef}
              type="file"
              accept="image/*,application/pdf"
              multiple
              onChange={appendFiles}
              className="sr-only"
            />

            {/* 썸네일 그리드 — 이미지는 미리보기, PDF는 아이콘. 각 썸네일 ✕ 버튼으로 개별 제거. */}
            {files.length > 0 && (
              <>
                <div className="grid grid-cols-3 gap-2">
                  {files.map((f, i) => (
                    <div
                      key={i}
                      className="relative aspect-square rounded-lg overflow-hidden bg-muted ring-1 ring-foreground/10"
                    >
                      {fileUrls[i] ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={fileUrls[i]!}
                          alt={f.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground p-2">
                          <FileText className="h-7 w-7 shrink-0" aria-hidden />
                          <span className="text-[10px] mt-1 line-clamp-2 text-center break-all">
                            {f.name}
                          </span>
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => removeFileAt(i)}
                        aria-label={`${f.name} 제거`}
                        className="absolute top-1 right-1 h-6 w-6 rounded-full bg-foreground/70 hover:bg-foreground text-background flex items-center justify-center shadow-sm transition-colors"
                      >
                        <X className="h-3.5 w-3.5" strokeWidth={2.5} />
                      </button>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground px-1">
                  {files.length}개 선택됨 · 합계 {formatSize(files.reduce((s, f) => s + f.size, 0))}
                </p>
              </>
            )}
          </div>
        )}

        {/* Locked photo list in reuse mode */}
        {reuse && (
          <div className="space-y-2">
            <Label>재사용할 파일 ({reuse.photos.length}개)</Label>
            <ul className="bg-muted rounded-xl p-3 text-xs space-y-1">
              {reuse.photos.map((p, i) => (
                <li key={p.path}>
                  <a
                    href={`/api/photo?id=${p.id}&variant=orig`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 truncate hover:text-foreground transition-colors"
                    title={`${p.name?.trim() || `파일 ${i + 1}`} · 원본 열기 ↗`}
                  >
                    <span>{p.isPdf ? '📄' : '🖼️'}</span>
                    <span className="truncate">{p.name?.trim() || `파일 ${i + 1}`}</span>
                    <span className="ml-auto text-muted-foreground shrink-0">↗</span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Hint textarea — only when actually doing extraction */}
        {showFileForm && (
        <div className="space-y-2">
          <Label htmlFor="hint">
            AI 추출 힌트 (선택)
            {hasAcademyDefault && !reuse && (
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                · 학원 기본값 적용됨 (이 업로드만 수정 가능)
              </span>
            )}
          </Label>
          <Textarea
            id="hint"
            value={hint}
            onChange={(e) => setHint(e.target.value)}
            placeholder="예: 'Lesson topics' 열은 수업 토픽이라 무시. 오른쪽 'Homework' 열만 숙제."
            rows={3}
            className="resize-y text-sm"
          />

          {/* Past hints quick-fill */}
          {pastHints.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                이전 힌트 재사용
              </div>
              <div className="flex flex-wrap gap-1.5">
                {pastHints.slice(0, 5).map((h, i) => (
                  <button
                    type="button"
                    key={i}
                    onClick={() => setHint(h)}
                    className={cn(
                      'text-xs px-3 py-1.5 rounded-full max-w-[260px] truncate font-medium transition-colors',
                      h === hint
                        ? 'bg-foreground text-background'
                        : 'bg-muted hover:bg-accent text-foreground/80'
                    )}
                    title={h}
                  >
                    “{h.length > 40 ? h.slice(0, 40) + '…' : h}”
                  </button>
                ))}
              </div>
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            없어도 AI가 알아서 숙제와 수업 안내를 구분함. 힌트가 있으면 더 정확함.
          </p>
        </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        {showFileForm && (
          <Button type="submit" disabled={busy} className="w-full h-11">
            {busy ? (
              <>
                {reuse ? '재분석 중' : '업로드 중'}<LoadingDots />
              </>
            ) : (
              reuse ? '이 파일로 다시 분석' : '업로드 후 분석'
            )}
          </Button>
        )}
      </form>
    </Card>
  )
}
