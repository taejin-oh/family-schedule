import Link from 'next/link'
import { revalidatePath } from 'next/cache'
import { Check } from 'lucide-react'
import { listCommittedItems, listDoneToday, toggleItemDone } from '@/server/actions/homework'
import { listTodayRecurring, listThisWeekRecurring, listDayRecurring, markRecurringDone, markRecurringUndone } from '@/server/actions/recurring'
import { listAcademies } from '@/server/actions/academies'
import { getDb } from '@/server/db/client'
import { eq } from 'drizzle-orm'
import * as appSchema from '@/server/db/schema'
import { buttonVariants } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { localDateIso } from '@/server/util/date'
import { HomeworkItem } from '@/app/_components/dashboard-item'
import { MultiSelectProvider, MultiSelectToggle } from '@/app/_components/multi-select-bar'

type ActiveItem = Awaited<ReturnType<typeof listCommittedItems>>[number]
type RecurringItem = {
  id: number
  title: string
  notes: string | null
  color: string
  cadence: 'daily' | 'weekly'
  doneAt: Date | null
  dateIso: string  // value to send to markRecurringDone (today/tomorrow for daily, anything-in-week for weekly)
}

type BucketKey = 'overdue' | 'today' | 'tomorrow' | 'thisweek' | 'nextweek' | 'later' | 'nodate'
type FilterKey = 'all' | 'today' | 'tomorrow' | 'thisweek' | 'nextweek'

const BUCKET_META: Record<BucketKey, { label: string; tone?: 'destructive' | 'today' }> = {
  overdue:  { label: '지났음', tone: 'destructive' },
  today:    { label: '오늘',   tone: 'today' },
  tomorrow: { label: '내일' },
  thisweek: { label: '이번 주' },
  nextweek: { label: '다음 주' },
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
  // Calendar-based week boundaries (Sunday = last day of week)
  const today = new Date(todayIso + 'T00:00:00')
  const dow = today.getDay()  // 0=Sun..6=Sat
  const daysUntilThisSunday = (7 - dow) % 7
  if (dd <= daysUntilThisSunday) return 'thisweek'
  if (dd <= daysUntilThisSunday + 7) return 'nextweek'
  return 'later'
}

function bucketize(items: ActiveItem[], todayIso: string): Record<BucketKey, ActiveItem[]> {
  const out: Record<BucketKey, ActiveItem[]> = {
    overdue: [], today: [], tomorrow: [], thisweek: [], nextweek: [], later: [], nodate: [],
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

function DuePill({ label, bucket }: { label: string; bucket: BucketKey }) {
  const cls =
    bucket === 'overdue'
      ? 'bg-destructive/15 text-destructive border-destructive/30'
      : bucket === 'today'
        ? 'bg-amber-100 text-amber-800 border-amber-300'
        : bucket === 'tomorrow'
          ? 'bg-blue-50 text-blue-800 border-blue-200'
          : 'bg-muted/60 text-muted-foreground border-foreground/10'
  return (
    <span className={cn('inline-block px-1.5 py-0.5 rounded-full text-xs border font-medium', cls)}>
      {label}
    </span>
  )
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
  return s === 'today' || s === 'tomorrow' || s === 'thisweek' || s === 'nextweek' || s === 'all'
}

function FilterChip({
  label,
  count,
  href,
  active,
  dot,
}: {
  label: string
  count: number
  href: string
  active: boolean
  dot?: string
}) {
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
      {dot && (
        <span
          className="w-2 h-2 rounded-full flex-shrink-0"
          style={{ background: dot }}
          aria-hidden
        />
      )}
      <span>{label}</span>
      <span className={cn('text-xs tabular-nums', active ? 'text-background/80' : 'text-muted-foreground/70')}>
        {count}
      </span>
    </Link>
  )
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; academy?: string }>
}) {
  const sp = await searchParams
  const filter: FilterKey = isFilterKey(sp.filter) ? sp.filter : 'all'
  const academyFilter = sp.academy ? Number(sp.academy) : null

  const [active, doneToday, todayRecurring, tomorrowRecurring, weekRecurring, academies] = await Promise.all([
    listCommittedItems(),
    listDoneToday(),
    listTodayRecurring(),
    listDayRecurring(1),
    listThisWeekRecurring(),
    listAcademies(),
  ])
  const todayIso = localDateIso()
  const tomorrowIso = tomorrowRecurring[0]?.targetDateIso ?? (() => {
    const t = new Date(); t.setDate(t.getDate() + 1); return localDateIso(t)
  })()
  // eslint-disable-next-line react-hooks/purity -- server component, Date.now() is evaluated per-request
  const now = Date.now()
  const buckets = bucketize(active, todayIso)

  // Annotate each recurring item with the date to send to markRecurringDone
  const todayRecur: RecurringItem[] = todayRecurring.map((r) => ({ ...r, dateIso: todayIso }))
  const tomorrowRecur: RecurringItem[] = tomorrowRecurring.map((r) => ({ ...r, dateIso: tomorrowIso }))
  const weekRecur: RecurringItem[] = weekRecurring.map((r) => ({ ...r, dateIso: todayIso }))
  // Daily inline in bucket sections (today/tomorrow buckets). Weekly NOT inlined here.
  const recurringActive = todayRecur.filter((r) => r.doneAt === null)
  const recurringDoneToday = todayRecur.filter((r) => r.doneAt !== null)
  const tomorrowRecurringActive = tomorrowRecur.filter((r) => r.doneAt === null)
  // Weekly recurring — shown in its own section (이번 주 할일), active only.
  const weeklyActive = weekRecur.filter((r) => r.doneAt === null)

  // Server actions for homework
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

  async function onSaveEdit(formData: FormData) {
    'use server'
    const id = Number(formData.get('id'))
    const title = formData.get('title')?.toString().trim() ?? ''
    const dueDate = formData.get('dueDate')?.toString().trim() || null
    if (!title) return
    const db = getDb()
    db.update(appSchema.homeworkItems)
      .set({ title, dueDate: dueDate ?? null })
      .where(eq(appSchema.homeworkItems.id, id))
      .run()
    revalidatePath('/')
  }

  // Server actions for recurring
  async function onRecurringComplete(formData: FormData) {
    'use server'
    const taskId = Number(formData.get('taskId'))
    const dateIso = formData.get('dateIso')?.toString() ?? localDateIso()
    await markRecurringDone(taskId, dateIso)
    revalidatePath('/')
  }

  async function onRecurringUndo(formData: FormData) {
    'use server'
    const taskId = Number(formData.get('taskId'))
    const dateIso = formData.get('dateIso')?.toString() ?? localDateIso()
    await markRecurringUndone(taskId, dateIso)
    revalidatePath('/')
  }

  // Academy filter: build list of academies that have active committed items
  const academiesWithItems = academies.filter((ac) =>
    active.some((it) => it.academyId === ac.id)
  )
  const showAcademyRow = academiesWithItems.length > 1

  // Apply academy filter to buckets
  const filteredBuckets: Record<BucketKey, ActiveItem[]> = academyFilter
    ? {
        overdue:  buckets.overdue.filter((it) => it.academyId === academyFilter),
        today:    buckets.today.filter((it) => it.academyId === academyFilter),
        tomorrow: buckets.tomorrow.filter((it) => it.academyId === academyFilter),
        thisweek: buckets.thisweek.filter((it) => it.academyId === academyFilter),
        nextweek: buckets.nextweek.filter((it) => it.academyId === academyFilter),
        later:    buckets.later.filter((it) => it.academyId === academyFilter),
        nodate:   buckets.nodate.filter((it) => it.academyId === academyFilter),
      }
    : buckets

  // Helper to build href preserving the other param
  function timeHref(f: string) {
    const p = new URLSearchParams()
    if (f !== 'all') p.set('filter', f)
    if (academyFilter) p.set('academy', String(academyFilter))
    const qs = p.toString()
    return qs ? `/?${qs}` : '/'
  }
  function academyHref(id: number | null) {
    const p = new URLSearchParams()
    if (filter !== 'all') p.set('filter', filter)
    if (id) p.set('academy', String(id))
    const qs = p.toString()
    return qs ? `/?${qs}` : '/'
  }

  const totalActive = active.length + recurringActive.length
  const totalDone = doneToday.length + recurringDoneToday.length
  const totalToday = totalActive + totalDone
  const completionPct = totalToday === 0 ? 0 : Math.round((totalDone / totalToday) * 100)

  // Decide which buckets to render based on time filter
  const visibleBuckets: BucketKey[] =
    filter === 'today'    ? ['overdue', 'today']
  : filter === 'tomorrow' ? ['tomorrow']
  : filter === 'thisweek' ? ['overdue', 'today', 'tomorrow', 'thisweek']
  : filter === 'nextweek' ? ['nextweek']
  : /* all */               ['overdue', 'today', 'tomorrow', 'thisweek', 'nextweek', 'later', 'nodate']

  // Weekly section label varies by current filter
  const weeklyLabel =
    filter === 'today'    ? '남은 이번 주 할일'
  : filter === 'tomorrow' ? '남은 이번 주 할일'
  : filter === 'nextweek' ? '남은 이번 주 할일'
  : /* thisweek / all */    '이번 주 할일'

  const weeklySection = weeklyActive.length === 0 ? null : (
    <section className="space-y-2">
      <div className="flex items-baseline gap-2 px-1">
        <h2 className="text-sm font-semibold text-foreground">{weeklyLabel}</h2>
        <span className="text-xs text-muted-foreground tabular-nums">({weeklyActive.length})</span>
      </div>
      <Card className="p-0 divide-y">
        {weeklyActive.map((rt) => (
          <div key={`w-${rt.id}`} className="p-3 flex items-start gap-3">
            <form action={onRecurringComplete} className="flex-shrink-0">
              <input type="hidden" name="taskId" value={rt.id} />
              <input type="hidden" name="dateIso" value={rt.dateIso} />
              <button
                type="submit"
                className="mt-0.5 flex items-center justify-center min-h-[44px] min-w-[44px] -mx-2.5 -my-2"
                aria-label="완료로 표시"
              >
                <span className="w-6 h-6 rounded-full border-2 border-muted-foreground hover:border-foreground hover:bg-accent transition-colors flex items-center justify-center" />
              </button>
            </form>
            <span
              className="mt-2 w-2.5 h-2.5 rounded-full flex-shrink-0"
              style={{ background: rt.color }}
              aria-hidden
            />
            <div className="flex-1 min-w-0">
              <div className="font-medium break-words">{rt.title}</div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                <span className="inline-block px-1.5 py-0.5 rounded-full text-xs border font-medium bg-violet-50 text-violet-700 border-violet-200">
                  🔁 매주
                </span>
              </div>
              {rt.notes && (
                <div className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap break-words line-clamp-3">
                  {rt.notes}
                </div>
              )}
            </div>
          </div>
        ))}
      </Card>
    </section>
  )

  // Count visible items for "empty" detection (includes recurring in today bucket)
  const visibleCount =
    visibleBuckets.reduce((s, k) => s + filteredBuckets[k].length, 0) +
    (visibleBuckets.includes('today') ? recurringActive.length : 0) +
    (visibleBuckets.includes('tomorrow') ? tomorrowRecurringActive.length : 0) +
    weeklyActive.length  // weekly section is visible across all filters

  const hasAnything = totalActive > 0 || totalDone > 0

  // Collect all selectable IDs for multi-select (active committed items across all visible buckets)
  const allSelectableIds = active.map((it) => it.id)

  return (
    <MultiSelectProvider selectableIds={allSelectableIds}>
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">할 일</h1>
        <Link href="/homework/upload" className={cn(buttonVariants())}>
          + 숙제 추가
        </Link>
      </div>

      {/* Top progress recap */}
      {hasAnything && (
        <Card className="p-4">
          <div className="flex items-baseline justify-between text-sm">
            <div>
              <span className="font-medium text-foreground">오늘 ✓ {totalDone}</span>
              <span className="text-muted-foreground"> · 남은 {totalActive}개</span>
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

      {/* Time filter chips + multi-select toggle */}
      {active.length > 0 && (
        <div className="flex flex-wrap gap-2 items-center">
          <FilterChip
            label="전체"
            count={active.length}
            href={timeHref('all')}
            active={filter === 'all'}
          />
          <FilterChip
            label="오늘"
            count={buckets.overdue.length + buckets.today.length + recurringActive.length + weeklyActive.length}
            href={timeHref('today')}
            active={filter === 'today'}
          />
          <FilterChip
            label="내일"
            count={buckets.tomorrow.length + tomorrowRecurringActive.length + weeklyActive.length}
            href={timeHref('tomorrow')}
            active={filter === 'tomorrow'}
          />
          <FilterChip
            label="이번 주"
            count={buckets.overdue.length + buckets.today.length + buckets.tomorrow.length + buckets.thisweek.length + weeklyActive.length}
            href={timeHref('thisweek')}
            active={filter === 'thisweek'}
          />
          <FilterChip
            label="다음 주"
            count={buckets.nextweek.length + weeklyActive.length}
            href={timeHref('nextweek')}
            active={filter === 'nextweek'}
          />
          <MultiSelectToggle />
        </div>
      )}

      {/* Academy filter chips (only shown when 2+ academies have items) */}
      {showAcademyRow && active.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <FilterChip
            label="전체"
            count={active.length}
            href={academyHref(null)}
            active={academyFilter === null}
          />
          {academiesWithItems.map((ac) => {
            const cnt = active.filter((it) => it.academyId === ac.id).length
            return (
              <FilterChip
                key={ac.id}
                label={ac.name}
                count={cnt}
                href={academyHref(ac.id)}
                active={academyFilter === ac.id}
                dot={ac.color}
              />
            )
          })}
        </div>
      )}

      {/* Empty states */}
      {!hasAnything ? (
        <Card className="p-10 text-center text-muted-foreground space-y-2">
          <div className="text-3xl">🎉</div>
          <div>할 일이 없습니다.</div>
          <div className="text-xs">사진이나 PDF를 업로드하면 AI가 숙제를 정리해 줍니다.</div>
        </Card>
      ) : totalActive === 0 ? (
        <Card className="p-6 text-center text-muted-foreground">
          <div className="text-2xl mb-1">🎉</div>
          <div className="text-sm">남은 할 일이 없어요. 잘했어!</div>
        </Card>
      ) : visibleCount === 0 ? (
        <Card className="p-6 text-center text-muted-foreground space-y-2">
          <div className="text-sm">선택한 기간에 할 일이 없습니다.</div>
          <Link
            href={academyFilter ? academyHref(null) : '/'}
            className="inline-block text-xs text-foreground/70 hover:text-foreground underline underline-offset-2"
          >
            전체 보기
          </Link>
        </Card>
      ) : filter === 'thisweek' ? (
        <div className="space-y-3">
          {weeklySection}
          {(() => {
            const allWeekHw = visibleBuckets.flatMap((bk) => filteredBuckets[bk])
            if (allWeekHw.length === 0) return null
            return (
              <section className="space-y-2">
                <div className="flex items-baseline gap-2 px-1">
                  <h2 className="text-sm font-semibold text-foreground">이번 주 숙제</h2>
                  <span className="text-xs text-muted-foreground tabular-nums">({allWeekHw.length})</span>
                </div>
                <Card className="p-0 divide-y">
                  {allWeekHw.map((it) => {
                    const dueLabel = formatDueLabel(it.dueDate, todayIso)
                    const itBucket = bucketOf(it, todayIso)
                    return (
                      <HomeworkItem
                        key={it.id}
                        id={it.id}
                        title={it.title}
                        notes={it.notes}
                        dueDate={it.dueDate}
                        academyName={it.academyName}
                        academyColor={it.academyColor}
                        dueLabel={dueLabel}
                        bucket={itBucket}
                        onComplete={onComplete}
                        onSave={onSaveEdit}
                      />
                    )
                  })}
                </Card>
              </section>
            )
          })()}
        </div>
      ) : (
        <div className="space-y-3">
          {filter === 'all' && weeklySection}
          {visibleBuckets.map((bk) => {
            const hwList = filteredBuckets[bk]
            const recurList: RecurringItem[] =
              bk === 'today' ? recurringActive :
              bk === 'tomorrow' ? tomorrowRecurringActive :
              []
            if (hwList.length === 0 && recurList.length === 0) return null
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
                  <span className="text-xs text-muted-foreground tabular-nums">
                    ({hwList.length + recurList.length})
                  </span>
                </div>
                <Card className="p-0 divide-y">
                  {hwList.map((it) => {
                    const dueLabel = formatDueLabel(it.dueDate, todayIso)
                    return (
                      <HomeworkItem
                        key={it.id}
                        id={it.id}
                        title={it.title}
                        notes={it.notes}
                        dueDate={it.dueDate}
                        academyName={it.academyName}
                        academyColor={it.academyColor}
                        dueLabel={dueLabel}
                        bucket={bk}
                        onComplete={onComplete}
                        onSave={onSaveEdit}
                      />
                    )
                  })}
                  {recurList.map((rt) => (
                    <div key={`r-${rt.id}`} className="p-3 flex items-start gap-3">
                      <form action={onRecurringComplete} className="flex-shrink-0">
                        <input type="hidden" name="taskId" value={rt.id} />
                        <input type="hidden" name="dateIso" value={rt.dateIso} />
                        <button
                          type="submit"
                          className="mt-0.5 flex items-center justify-center min-h-[44px] min-w-[44px] -mx-2.5 -my-2"
                          aria-label="완료로 표시"
                        >
                          <span className="w-6 h-6 rounded-full border-2 border-muted-foreground hover:border-foreground hover:bg-accent transition-colors flex items-center justify-center" />
                        </button>
                      </form>
                      <span
                        className="mt-2 w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{ background: rt.color }}
                        aria-hidden
                      />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium break-words">{rt.title}</div>
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                          <span className={cn(
                            'inline-block px-1.5 py-0.5 rounded-full text-xs border font-medium',
                            rt.cadence === 'weekly'
                              ? 'bg-violet-50 text-violet-700 border-violet-200'
                              : 'bg-muted/60 text-muted-foreground border-foreground/10',
                          )}>
                            {rt.cadence === 'weekly' ? '🔁 매주' : '🔁 매일'}
                          </span>
                        </div>
                        {rt.notes && (
                          <div className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap break-words line-clamp-3">
                            {rt.notes}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </Card>
              </section>
            )
          })}
          {(filter === 'today' || filter === 'tomorrow' || filter === 'nextweek') && weeklySection}
        </div>
      )}

      {/* 오늘 한 일 — collapsible */}
      {(doneToday.length > 0 || recurringDoneToday.length > 0) && (
        <details className="group rounded-xl ring-1 ring-foreground/10 bg-card overflow-hidden" open>
          <summary className="cursor-pointer select-none flex items-center justify-between px-4 py-3 text-sm font-medium hover:bg-accent/40 transition-colors">
            <span className="flex items-center gap-2">
              <Check className="h-4 w-4 text-green-600" aria-hidden />
              오늘 한 일 ({doneToday.length + recurringDoneToday.length})
            </span>
            <span className="text-xs text-muted-foreground group-open:hidden">펼치기</span>
            <span className="text-xs text-muted-foreground hidden group-open:inline">접기</span>
          </summary>
          <div className="divide-y border-t">
            {doneToday.map((it) => (
              <div key={it.id} className="p-3 flex items-start gap-3 opacity-60 hover:opacity-100 transition-opacity">
                <form action={onUndo} className="flex-shrink-0">
                  <input type="hidden" name="id" value={it.id} />
                  <button
                    type="submit"
                    className="mt-0.5 w-6 h-6 rounded-full bg-green-600 flex items-center justify-center hover:ring-2 hover:ring-red-400 hover:ring-offset-1 transition-all"
                    aria-label="완료 취소"
                  >
                    <Check className="h-3.5 w-3.5 text-white" aria-hidden />
                  </button>
                </form>
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
              </div>
            ))}
            {recurringDoneToday.map((rt) => (
              <div key={`r-${rt.id}`} className="p-3 flex items-start gap-3 opacity-60 hover:opacity-100 transition-opacity">
                <form action={onRecurringUndo} className="flex-shrink-0">
                  <input type="hidden" name="taskId" value={rt.id} />
                  <input type="hidden" name="dateIso" value={todayIso} />
                  <button
                    type="submit"
                    className="mt-0.5 w-6 h-6 rounded-full bg-green-600 flex items-center justify-center hover:ring-2 hover:ring-red-400 hover:ring-offset-1 transition-all"
                    aria-label="완료 취소"
                  >
                    <Check className="h-3.5 w-3.5 text-white" aria-hidden />
                  </button>
                </form>
                <span
                  className="mt-2 w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ background: rt.color }}
                  aria-hidden
                />
                <div className="flex-1 min-w-0">
                  <div className="font-medium break-words line-through decoration-muted-foreground/40">
                    {rt.title}
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                    <span className="inline-block px-1.5 py-0.5 rounded-full text-xs border font-medium bg-muted/60 border-foreground/10">
                      🔁 매일
                    </span>
                    {rt.doneAt && <> · {formatRelative(rt.doneAt, now)} 완료</>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
    </MultiSelectProvider>
  )
}
