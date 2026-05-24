import Link from 'next/link'
import { revalidatePath } from 'next/cache'
import { Check, Undo2 } from 'lucide-react'
import { listCommittedItems, listDoneToday, toggleItemDone } from '@/server/actions/homework'
import { buttonVariants } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

type ActiveItem = Awaited<ReturnType<typeof listCommittedItems>>[number]

type BucketKey = 'overdue' | 'today' | 'tomorrow' | 'thisweek' | 'later' | 'nodate'
type FilterKey = 'all' | 'today' | 'tomorrow' | 'thisweek'

const BUCKET_META: Record<BucketKey, { label: string; tone?: 'destructive' | 'today' }> = {
  overdue:  { label: '지났음', tone: 'destructive' },
  today:    { label: '오늘',   tone: 'today' },
  tomorrow: { label: '내일' },
  thisweek: { label: '이번 주' },
  later:    { label: '이후' },
  nodate:   { label: '기한 없음' },
}

function diffDays(due: string, todayIso: string): number {
  const t = new Date(todayIso + 'T00:00:00')
  const d = new Date(due + 'T00:00:00')
  return Math.round((d.getTime() - t.getTime()) / 86_400_000)
}

function bucketOf(item: ActiveItem, todayIso: string): BucketKey {
  if (!item.dueDate) return 'nodate'
  const dd = diffDays(item.dueDate, todayIso)
  if (dd < 0) return 'overdue'
  if (dd === 0) return 'today'
  if (dd === 1) return 'tomorrow'
  if (dd <= 7) return 'thisweek'
  return 'later'
}

function bucketize(items: ActiveItem[], todayIso: string): Record<BucketKey, ActiveItem[]> {
  const out: Record<BucketKey, ActiveItem[]> = {
    overdue: [], today: [], tomorrow: [], thisweek: [], later: [], nodate: [],
  }
  for (const it of items) out[bucketOf(it, todayIso)].push(it)
  return out
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

function isFilterKey(s: string | undefined): s is FilterKey {
  return s === 'today' || s === 'tomorrow' || s === 'thisweek' || s === 'all'
}

function FilterChip({ label, count, href, active }: { label: string; count: number; href: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={cn(
        'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm transition-colors border',
        active
          ? 'bg-foreground text-background border-foreground'
          : 'bg-card text-muted-foreground border-foreground/10 hover:bg-accent hover:text-foreground'
      )}
    >
      <span>{label}</span>
      <span className={cn('text-xs tabular-nums', active ? 'text-background/80' : 'text-muted-foreground/70')}>
        {count}
      </span>
    </Link>
  )
}

export default async function HomePage({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  const sp = await searchParams
  const filter: FilterKey = isFilterKey(sp.filter) ? sp.filter : 'all'

  const [active, doneToday] = await Promise.all([listCommittedItems(), listDoneToday()])
  const todayIso = new Date().toISOString().slice(0, 10)
  const now = Date.now()
  const buckets = bucketize(active, todayIso)

  async function onComplete(formData: FormData) {
    'use server'
    const id = Number(formData.get('id'))
    await toggleItemDone(id, true)
    revalidatePath('/')
  }

  async function onUndo(formData: FormData) {
    'use server'
    const id = Number(formData.get('id'))
    await toggleItemDone(id, false)
    revalidatePath('/')
  }

  const totalToday = active.length + doneToday.length
  const completionPct = totalToday === 0 ? 0 : Math.round((doneToday.length / totalToday) * 100)

  // Decide which buckets to render based on filter
  const visibleBuckets: BucketKey[] =
    filter === 'today'    ? ['overdue', 'today']
  : filter === 'tomorrow' ? ['tomorrow']
  : filter === 'thisweek' ? ['overdue', 'today', 'tomorrow', 'thisweek']
  : /* all */               ['overdue', 'today', 'tomorrow', 'thisweek', 'later', 'nodate']

  const visibleCount = visibleBuckets.reduce((s, k) => s + buckets[k].length, 0)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">할 일</h1>
        <Link href="/homework/upload" className={cn(buttonVariants())}>
          📷 사진/PDF 추가
        </Link>
      </div>

      {/* Top progress recap */}
      {(active.length > 0 || doneToday.length > 0) && (
        <Card className="p-4">
          <div className="flex items-baseline justify-between text-sm">
            <div>
              <span className="font-medium text-foreground">오늘 ✓ {doneToday.length}</span>
              <span className="text-muted-foreground"> · 남은 {active.length}개</span>
            </div>
            <div className="text-xs text-muted-foreground tabular-nums">{completionPct}%</div>
          </div>
          <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-foreground transition-all"
              style={{ width: `${completionPct}%` }}
              aria-hidden
            />
          </div>
        </Card>
      )}

      {/* Filter chips */}
      {active.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <FilterChip
            label="전체"
            count={active.length}
            href="/"
            active={filter === 'all'}
          />
          <FilterChip
            label="오늘"
            count={buckets.overdue.length + buckets.today.length}
            href="/?filter=today"
            active={filter === 'today'}
          />
          <FilterChip
            label="내일"
            count={buckets.tomorrow.length}
            href="/?filter=tomorrow"
            active={filter === 'tomorrow'}
          />
          <FilterChip
            label="이번 주"
            count={buckets.overdue.length + buckets.today.length + buckets.tomorrow.length + buckets.thisweek.length}
            href="/?filter=thisweek"
            active={filter === 'thisweek'}
          />
        </div>
      )}

      {/* Empty states */}
      {active.length === 0 && doneToday.length === 0 ? (
        <Card className="p-10 text-center text-muted-foreground space-y-2">
          <div className="text-3xl">🎉</div>
          <div>할 일이 없습니다.</div>
          <div className="text-xs">사진이나 PDF를 업로드하면 AI가 숙제를 정리해 줍니다.</div>
        </Card>
      ) : active.length === 0 ? (
        <Card className="p-6 text-center text-muted-foreground">
          <div className="text-2xl mb-1">🎉</div>
          <div className="text-sm">남은 할 일이 없어요. 잘했어!</div>
        </Card>
      ) : visibleCount === 0 ? (
        <Card className="p-6 text-center text-muted-foreground space-y-2">
          <div className="text-sm">선택한 기간에 할 일이 없습니다.</div>
          <Link
            href="/"
            className="inline-block text-xs text-foreground/70 hover:text-foreground underline underline-offset-2"
          >
            전체 보기
          </Link>
        </Card>
      ) : (
        <div className="space-y-3">
          {visibleBuckets.map((bk) => {
            const list = buckets[bk]
            if (list.length === 0) return null
            const meta = BUCKET_META[bk]
            return (
              <section key={bk} className="space-y-2">
                <div className="flex items-baseline gap-2 px-1">
                  <h2
                    className={cn(
                      'text-sm font-semibold',
                      meta.tone === 'destructive' && 'text-destructive',
                      meta.tone === 'today' && 'text-foreground',
                      !meta.tone && 'text-muted-foreground'
                    )}
                  >
                    {meta.label}
                  </h2>
                  <span className="text-xs text-muted-foreground tabular-nums">({list.length})</span>
                </div>
                <Card className="p-0 divide-y">
                  {list.map((it) => {
                    const dueLabel = formatDueLabel(it.dueDate, todayIso)
                    const isOverdue = bk === 'overdue'
                    const isTodayBucket = bk === 'today'
                    return (
                      <div key={it.id} className="p-3 flex items-start gap-3">
                        <form action={onComplete} className="flex-shrink-0">
                          <input type="hidden" name="id" value={it.id} />
                          <button
                            type="submit"
                            className="mt-0.5 w-6 h-6 rounded-full border-2 border-muted-foreground hover:border-foreground hover:bg-accent transition-colors flex items-center justify-center"
                            aria-label="완료로 표시"
                          />
                        </form>
                        <span
                          className="mt-2 w-2.5 h-2.5 rounded-full flex-shrink-0"
                          style={{ background: it.academyColor }}
                          aria-hidden
                        />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium break-words">{it.title}</div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {it.academyName}
                            {dueLabel && (
                              <>
                                {' · '}
                                <span
                                  className={cn(
                                    isOverdue && 'text-destructive font-medium',
                                    isTodayBucket && 'text-foreground font-medium'
                                  )}
                                >
                                  {dueLabel}
                                </span>
                              </>
                            )}
                          </div>
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
              </section>
            )
          })}
        </div>
      )}

      {/* 오늘 한 일 — collapsible */}
      {doneToday.length > 0 && (
        <details className="group rounded-xl ring-1 ring-foreground/10 bg-card overflow-hidden" open>
          <summary className="cursor-pointer select-none flex items-center justify-between px-4 py-3 text-sm font-medium hover:bg-accent/40 transition-colors">
            <span className="flex items-center gap-2">
              <Check className="h-4 w-4 text-green-600" aria-hidden />
              오늘 한 일 ({doneToday.length})
            </span>
            <span className="text-xs text-muted-foreground group-open:hidden">펼치기</span>
            <span className="text-xs text-muted-foreground hidden group-open:inline">접기</span>
          </summary>
          <div className="divide-y border-t">
            {doneToday.map((it) => (
              <div key={it.id} className="p-3 flex items-start gap-3 opacity-60 hover:opacity-100 transition-opacity">
                <div
                  className="mt-0.5 w-6 h-6 rounded-full bg-green-600 flex items-center justify-center flex-shrink-0"
                  aria-label="완료됨"
                >
                  <Check className="h-3.5 w-3.5 text-white" aria-hidden />
                </div>
                <span
                  className="mt-2 w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ background: it.academyColor }}
                  aria-hidden
                />
                <div className="flex-1 min-w-0">
                  <div className="font-medium break-words line-through decoration-muted-foreground/40">
                    {it.title}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {it.academyName}
                    {it.doneAt && <> · {formatRelative(it.doneAt, now)} 완료</>}
                  </div>
                </div>
                <form action={onUndo} className="flex-shrink-0">
                  <input type="hidden" name="id" value={it.id} />
                  <button
                    type="submit"
                    className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded hover:bg-accent"
                    aria-label="되돌리기"
                  >
                    <Undo2 className="h-3 w-3" aria-hidden />
                    되돌리기
                  </button>
                </form>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  )
}
