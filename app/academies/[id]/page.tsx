import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getAcademyDetail } from '@/server/actions/academy-detail'
import { buttonVariants } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { localDateIso } from '@/server/util/date'

const SUBJECT_KO: Record<string, string> = {
  math: '수학', english: '영어', korean: '국어', art: '미술',
  music: '음악', pe: '체육', science: '과학', other: '기타',
}
const DAY_KO: Record<string, string> = { mon: '월', tue: '화', wed: '수', thu: '목', fri: '금', sat: '토', sun: '일' }

const STATUS_KO: Record<string, string> = {
  committed: '확정됨', ready: '검토 대기', failed: '실패', pending: '대기 중', processing: '처리 중',
}

function diffDays(due: string, todayIso: string): number {
  const t = new Date(todayIso + 'T00:00:00')
  const d = new Date(due + 'T00:00:00')
  return Math.round((d.getTime() - t.getTime()) / 86_400_000)
}

function formatDueLabel(due: string | null, todayIso: string): string | null {
  if (!due) return null
  const dd = diffDays(due, todayIso)
  if (dd < 0) return `${Math.abs(dd)}일 지남`
  if (dd === 0) return '오늘'
  if (dd === 1) return '내일'
  if (dd <= 7) return `${dd}일 후`
  return due
}

function formatRelative(doneAt: Date, now: number): string {
  const diffMs = now - doneAt.getTime()
  const diffMin = Math.floor(diffMs / 60_000)
  if (diffMin < 1) return '방금'
  if (diffMin < 60) return `${diffMin}분 전`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) {
    const h = doneAt.getHours()
    const m = doneAt.getMinutes()
    const ampm = h < 12 ? '오전' : '오후'
    const hh = h === 0 ? 12 : h > 12 ? h - 12 : h
    return `${ampm} ${hh}:${String(m).padStart(2, '0')}`
  }
  return `${Math.floor(diffHr / 24)}일 전`
}

function formatBatchDate(d: Date): string {
  const mo = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const h = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return `${mo}/${day} ${h}:${mi}`
}

export default async function AcademyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const numId = Number(id)
  const data = await getAcademyDetail(numId)
  if (!data) notFound()

  const { academy, active, done, batches } = data
  const todayIso = localDateIso()
  const now = Date.now()

  const scheduleSlots = academy.scheduleRule?.slots ?? []

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Link href="/academies" className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}>
          ← 학원 목록
        </Link>
        <Link href={`/academies/${numId}/edit`} className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}>
          편집
        </Link>
      </div>

      {/* Academy info card */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <span
            className="inline-block w-3 h-3 rounded-full flex-shrink-0"
            style={{ background: academy.color }}
            aria-hidden
          />
          <h1 className="text-xl font-semibold">{academy.name}</h1>
          <span className="text-sm text-muted-foreground">({SUBJECT_KO[academy.subject] ?? academy.subject})</span>
        </div>

        {scheduleSlots.length > 0 && (
          <div className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">이번 주: </span>
            {scheduleSlots.map((s, i) => (
              <span key={i}>
                {i > 0 && ' · '}
                {DAY_KO[s.day] ?? s.day} {s.start}–{s.end}
              </span>
            ))}
          </div>
        )}

        {academy.location && (
          <div className="text-sm">
            <span className="text-muted-foreground">위치: </span>
            {academy.location}
          </div>
        )}

        {academy.notes && (
          <div className="text-sm">
            <span className="text-muted-foreground">메모: </span>
            {academy.notes}
          </div>
        )}

        {academy.extractionHint && (
          <div className="text-xs text-muted-foreground bg-muted/50 rounded px-2 py-1">
            힌트: &ldquo;{academy.extractionHint}&rdquo;
          </div>
        )}
      </Card>

      {/* Active homework */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold px-1">📚 진행 중인 숙제 ({active.length})</h2>
        {active.length === 0 ? (
          <Card className="p-4 text-sm text-muted-foreground text-center">진행 중인 숙제가 없습니다.</Card>
        ) : (
          <Card className="p-0 divide-y">
            {active.map((it) => {
              const dueLabel = formatDueLabel(it.dueDate, todayIso)
              const isOverdue = it.dueDate ? diffDays(it.dueDate, todayIso) < 0 : false
              return (
                <div key={it.id} className="p-3 flex items-start gap-2">
                  <span className="mt-1 flex-shrink-0 text-muted-foreground">○</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium break-words">[{it.title}]</div>
                    {dueLabel && (
                      <div className={cn('text-xs mt-0.5', isOverdue ? 'text-destructive font-medium' : 'text-muted-foreground')}>
                        {dueLabel}
                      </div>
                    )}
                    {it.notes && (
                      <div className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap break-words line-clamp-3">
                        {it.notes}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </Card>
        )}
      </section>

      {/* Recent batches */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold px-1">📦 최근 업로드 batch ({batches.length})</h2>
        {batches.length === 0 ? (
          <Card className="p-4 text-sm text-muted-foreground text-center">업로드된 batch가 없습니다.</Card>
        ) : (
          <Card className="p-0 divide-y">
            {batches.map((b) => (
              <div key={b.id} className="p-3 flex items-center gap-2 text-sm">
                <span className="text-muted-foreground tabular-nums flex-shrink-0">
                  {formatBatchDate(b.capturedAt)}
                </span>
                <span
                  className={cn(
                    'flex-shrink-0 inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium',
                    b.status === 'committed' && 'bg-green-100 text-green-700',
                    b.status === 'ready' && 'bg-blue-100 text-blue-700',
                    b.status === 'failed' && 'bg-red-100 text-red-700',
                    (b.status === 'pending' || b.status === 'processing') && 'bg-muted text-muted-foreground'
                  )}
                >
                  {STATUS_KO[b.status] ?? b.status}
                </span>
                <span className="text-muted-foreground text-xs">
                  PDF/사진 {b.photoCount}개 · 항목 {b.itemCount}개
                </span>
              </div>
            ))}
          </Card>
        )}
      </section>

      {/* Completed homework (collapsible) */}
      {done.length > 0 && (
        <details className="group rounded-xl ring-1 ring-foreground/10 bg-card overflow-hidden">
          <summary className="cursor-pointer select-none flex items-center justify-between px-4 py-3 text-sm font-medium hover:bg-accent/40 transition-colors">
            <span>✓ 완료한 숙제 ({done.length})</span>
            <span className="text-xs text-muted-foreground group-open:hidden">▼ 펼치기</span>
            <span className="text-xs text-muted-foreground hidden group-open:inline">▲ 접기</span>
          </summary>
          <div className="divide-y border-t">
            {done.map((it) => (
              <div key={it.id} className="p-3 flex items-start gap-2 opacity-60">
                <span className="mt-1 flex-shrink-0 text-green-600">✓</span>
                <div className="flex-1 min-w-0">
                  <div className="font-medium break-words line-through decoration-muted-foreground/40">
                    {it.title}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {it.dueDate && <>~{it.dueDate} </>}
                    {it.doneAt && <>{formatRelative(it.doneAt, now)} 완료</>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  )
}
