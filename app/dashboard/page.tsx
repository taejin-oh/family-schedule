import Link from 'next/link'
import { revalidatePath } from 'next/cache'
import { Check } from 'lucide-react'
import { listCommittedItems, listDoneToday, listDoneThisWeek, toggleItemDone } from '@/server/actions/homework'
import { listTodayRecurring, listThisWeekRecurring, listDayRecurring, markRecurringDone, markRecurringUndone } from '@/server/actions/recurring'
import { listAcademies } from '@/server/actions/academies'
import { buttonVariants } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { localDateIso } from '@/server/util/date'
import { HomeworkItem } from '@/app/_components/dashboard-item'
import { RecurringItem as RecurringItemRow } from '@/app/_components/recurring-item'
import { MultiSelectProvider, MultiSelectToggle } from '@/app/_components/multi-select-bar'
import { FilterChipGroup } from './_components/filter-chip'
import { logServerEvent } from '@/server/log/server-event'

type ActiveItem = Awaited<ReturnType<typeof listCommittedItems>>[number]
type DayKey = 'mon'|'tue'|'wed'|'thu'|'fri'|'sat'|'sun'
type RecurringItem = {
  id: number
  title: string
  notes: string | null
  color: string
  cadence: 'daily' | 'weekly'
  daysOfWeek?: DayKey[]
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
  nextweek: { label: '다음 주 숙제' },
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
        'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold transition-colors',
        active
          ? 'bg-foreground text-background'
          : 'bg-card text-foreground/80 hover:bg-accent hover:text-foreground'
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
      <span className={cn('text-xs font-normal tabular-nums', active ? 'text-background/80' : 'text-muted-foreground')}>
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

  // 모든 데이터를 항상 fetch — chip count들이 서로 다른 데이터셋을 참조하기 때문에
  // 조건부 fetch하면 filter 변경에 따라 count가 stale로 보임 (예: "오늘" chip count에
  // weeklyActive가 들어가는데 filter=today일 때 weekRecurring=[]로 떨어지면 count 줄어듦).
  // sqlite sync 호출이라 7개 query 합쳐도 ms 단위. 데이터 일관성 우선.
  // eslint-disable-next-line react-hooks/purity -- server component perf measurement
  const tFetch0 = performance.now()
  const [active, doneToday, doneThisWeek, todayRecurring, tomorrowRecurring, weekRecurring, academies] = await Promise.all([
    listCommittedItems(),
    listDoneToday(),
    listDoneThisWeek(),
    listTodayRecurring(),
    listDayRecurring(1),
    listThisWeekRecurring(),
    listAcademies(),
  ])
  await logServerEvent({
    category: 'perf',
    event: 'dashboard.fetch',
    props: {
      filter,
      // eslint-disable-next-line react-hooks/purity -- server component perf measurement
      ms: Math.round(performance.now() - tFetch0),
      active: active.length,
      academies: academies.length,
    },
  })
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
  // Weekly done — shown in its own '완료한 이번 주 할일' section.
  const weeklyDone = weekRecur.filter((r) => r.doneAt !== null)

  // Server actions for homework
  async function onComplete(formData: FormData) {
    'use server'
    const id = Number(formData.get('id'))
    await toggleItemDone(id, true)
    revalidatePath('/')
    revalidatePath('/dashboard')
  }

  async function onUndo(formData: FormData) {
    'use server'
    const id = Number(formData.get('id'))
    await toggleItemDone(id, false)
    revalidatePath('/')
    revalidatePath('/dashboard')
  }

  // Server actions for recurring
  async function onRecurringComplete(formData: FormData) {
    'use server'
    const taskId = Number(formData.get('taskId'))
    const dateIso = formData.get('dateIso')?.toString() ?? localDateIso()
    await markRecurringDone(taskId, dateIso)
    revalidatePath('/')
    revalidatePath('/dashboard')
  }

  async function onRecurringUndo(formData: FormData) {
    'use server'
    const taskId = Number(formData.get('taskId'))
    const dateIso = formData.get('dateIso')?.toString() ?? localDateIso()
    await markRecurringUndone(taskId, dateIso)
    revalidatePath('/')
    revalidatePath('/dashboard')
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

  // Helper to build href preserving the other param.
  // Targets /dashboard (this page) — earlier the dashboard lived at "/" and
  // these helpers still pointed there after the split.
  function timeHref(f: string) {
    const p = new URLSearchParams()
    if (f !== 'all') p.set('filter', f)
    if (academyFilter) p.set('academy', String(academyFilter))
    const qs = p.toString()
    return qs ? `/dashboard?${qs}` : '/dashboard'
  }
  function academyHref(id: number | null) {
    const p = new URLSearchParams()
    if (filter !== 'all') p.set('filter', filter)
    if (id) p.set('academy', String(id))
    const qs = p.toString()
    return qs ? `/dashboard?${qs}` : '/dashboard'
  }

  const totalActive = active.length + recurringActive.length
  const totalDone = doneToday.length + recurringDoneToday.length

  // REMAINING은 화면 상단 필터 범위에 따라 분모/분자를 다르게 계산.
  // tomorrow / nextweek는 미래 시점이라 완료 섹션 자체가 비표시 → progress bar 숨김.
  type ProgressScope = 'today' | 'thisweek' | 'all' | null
  const progressScope: ProgressScope =
    filter === 'today'    ? 'today'
  : filter === 'thisweek' ? 'thisweek'
  : filter === 'all'      ? 'all'
  :                         null

  const scopeActive =
    progressScope === 'today'
      // 사용자 정의 "오늘 = 내일까지 마감" 적용 — overdue + today + tomorrow.
      ? filteredBuckets.overdue.length + filteredBuckets.today.length + filteredBuckets.tomorrow.length + recurringActive.length
    : progressScope === 'thisweek'
      ? filteredBuckets.overdue.length + filteredBuckets.today.length
        + filteredBuckets.tomorrow.length + filteredBuckets.thisweek.length
        + recurringActive.length + weeklyActive.length
    : progressScope === 'all'
      ? (academyFilter
          ? Object.values(filteredBuckets).reduce((s, arr) => s + arr.length, 0)
          : active.length)
        + recurringActive.length + weeklyActive.length
    : totalActive  // tomorrow / nextweek — progress bar 숨길 거지만 큰 숫자엔 사용

  const scopeDone =
    progressScope === 'today'    ? doneToday.length + recurringDoneToday.length
  : progressScope === 'thisweek' ? doneThisWeek.length + recurringDoneToday.length
  : progressScope === 'all'      ? doneThisWeek.length + recurringDoneToday.length
  :                                 0

  const scopeTotal = scopeActive + scopeDone
  const completionPct = scopeTotal === 0 ? 0 : Math.round((scopeDone / scopeTotal) * 100)

  const scopeLabel =
    progressScope === 'today'    ? '오늘'
  : progressScope === 'thisweek' ? '이번 주'
  : progressScope === 'all'      ? '전체'
  :                                 null

  // Decide which buckets to render based on time filter.
  // 사용자 정의 "오늘 = 내일까지 마감": filter='today'엔 tomorrow도 포함.
  // filter='tomorrow'는 "내일만 단독 보기" 별도 옵션으로 유지.
  // '전체' 필터에서도 tomorrow는 today와 인지 겹쳐 노이즈 — '내일' 필터로 따로.
  const visibleBuckets: BucketKey[] =
    filter === 'today'    ? ['overdue', 'today', 'tomorrow']
  : filter === 'tomorrow' ? ['tomorrow']
  : filter === 'thisweek' ? ['overdue', 'today', 'tomorrow', 'thisweek']
  : filter === 'nextweek' ? ['nextweek']
  : /* all */               ['overdue', 'today', 'tomorrow', 'thisweek', 'nextweek', 'later', 'nodate']

  // Weekly section label varies by current filter
  const weeklyLabel =
    filter === 'today'    ? '남은 이번 주 할일'
  : filter === 'tomorrow' ? '남은 이번 주 할일'
  : /* thisweek / all */    '이번 주 할일'
  // nextweek filter is excluded — it uses nextWeekPreviewSection instead.

  // Preview of weekly tasks that will reset next Monday (used only on filter='nextweek').
  // Read-only — no toggle since 'doneAt' here reflects current week's completion, not next week's.
  const nextWeekPreviewSection = filter !== 'nextweek' || weekRecur.length === 0 ? null : (
    <section className="space-y-2">
      <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-1 pt-1">
        다음 주 할일 · {weekRecur.length}
      </h2>
      <Card className="p-0 gap-0 divide-y divide-foreground/10">
        {weekRecur.map((rt) => (
          <div key={`nw-${rt.id}`} className="px-4 py-3 flex items-center gap-3 opacity-60">
            <span className="w-[22px] h-[22px] rounded-full border-2 border-muted-foreground/30 flex-shrink-0" aria-hidden />
            <span
              className="w-[5px] h-9 rounded-full flex-shrink-0"
              style={{ background: rt.color }}
              aria-hidden
            />
            <div className="flex-1 min-w-0">
              <div className="font-medium text-[15px] break-words leading-snug">{rt.title}</div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold bg-violet-100 text-violet-700">
                  🔁 이번 주 안에
                </span>
              </div>
            </div>
          </div>
        ))}
      </Card>
    </section>
  )

  const weeklySection = weeklyActive.length === 0 ? null : (
    <section className="space-y-2">
      <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-1 pt-1">
        {weeklyLabel} · {weeklyActive.length}
      </h2>
      <Card className="p-0 gap-0 divide-y divide-foreground/10">
        {weeklyActive.map((rt) => (
          <RecurringItemRow
            key={`w-${rt.id}`}
            id={rt.id}
            title={rt.title}
            notes={rt.notes}
            color={rt.color}
            cadence={rt.cadence}
            daysOfWeek={[]}
            dateIso={rt.dateIso}
            onComplete={onRecurringComplete}
          />
        ))}
      </Card>
    </section>
  )

  // Count visible items for "empty" detection (includes recurring in today bucket)
  const visibleCount =
    visibleBuckets.reduce((s, k) => s + filteredBuckets[k].length, 0) +
    (visibleBuckets.includes('today') ? recurringActive.length : 0) +
    (visibleBuckets.includes('tomorrow') && (filter === 'tomorrow' || filter === 'thisweek') ? tomorrowRecurringActive.length : 0) +
    (filter === 'nextweek' ? weekRecur.length : weeklyActive.length)

  const hasAnything = totalActive > 0 || totalDone > 0

  // 다중 선택 대상 — active + 완료된 homework (오늘 + 이번 주). recurring은 ID 체계가
  // 다르고 사용 빈도 낮아서 일단 제외. doneIds는 dedup (이번 주에는 오늘도 포함되므로).
  const activeIds = active.map((it) => it.id)
  const doneIdsSet = new Set<number>()
  for (const it of doneToday) doneIdsSet.add(it.id)
  for (const it of doneThisWeek) doneIdsSet.add(it.id)
  const doneIds = [...doneIdsSet]

  return (
    <MultiSelectProvider activeIds={activeIds} doneIds={doneIds}>
    <div className="space-y-4">
      <header className="px-1 pt-2 pb-1 flex items-end justify-between gap-2">
        <div>
          <h1 className="text-[30px] leading-tight font-bold tracking-tight">할 일</h1>
          <div className="text-sm text-muted-foreground mt-0.5 flex items-center gap-2">
            <span>남은 {totalActive} · 완료 {totalDone}</span>
            <Link
              href="/"
              className="text-muted-foreground hover:text-foreground"
            >
              · 아이 보기
            </Link>
          </div>
        </div>
        <Link href="/homework/upload" className={cn(buttonVariants({ size: 'sm' }))}>
          + 숙제
        </Link>
      </header>

      {hasAnything && (
        <Card className="p-4 gap-2">
          <div className="flex items-center gap-4">
            <div className="text-[36px] leading-none font-bold tabular-nums">{scopeActive}</div>
            <div className="flex-1 min-w-0">
              <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                REMAINING
              </div>
              <div className="text-sm font-medium mt-0.5">
                {scopeLabel
                  ? <>{scopeLabel} ✓ {scopeDone} · {completionPct}% 완료</>
                  : <>남은 {scopeActive}개</>}
              </div>
            </div>
            {scopeLabel && (
              <div className="text-sm text-muted-foreground tabular-nums shrink-0">{completionPct}%</div>
            )}
          </div>
          {scopeLabel && (
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-foreground transition-all"
                style={{ width: `${completionPct}%` }}
                aria-hidden
              />
            </div>
          )}
        </Card>
      )}

      {active.length > 0 && (
        <div className="flex flex-wrap gap-2 items-center">
          <FilterChipGroup
            key={filter}
            current={filter}
            chips={[
              // 전체: 모든 미완료 항목 (homework + recurring 모두 포함)
              { key: 'all', label: '전체', count: active.length + recurringActive.length + weeklyActive.length, href: timeHref('all') },
              // 오늘: 오늘까지 마감(지난 마감 포함) + 오늘 daily recurring
              { key: 'today', label: '오늘', count: buckets.overdue.length + buckets.today.length + recurringActive.length, href: timeHref('today') },
              // 내일만: 내일 마감 + 내일 daily recurring
              { key: 'tomorrow', label: '내일만', count: buckets.tomorrow.length + tomorrowRecurringActive.length, href: timeHref('tomorrow') },
              // 이번 주: 이번 주 안에 해야 할 모든 것 (지난+오늘+내일+이번주 + daily recurring + weekly recurring)
              { key: 'thisweek', label: '이번 주', count: buckets.overdue.length + buckets.today.length + buckets.tomorrow.length + buckets.thisweek.length + recurringActive.length + weeklyActive.length, href: timeHref('thisweek') },
              // 다음 주: 다음 주 마감만 (이번 주 weekly recurring은 포함 X — 다음 주 새로 시작)
              { key: 'nextweek', label: '다음 주', count: buckets.nextweek.length, href: timeHref('nextweek') },
            ]}
          />
          <MultiSelectToggle />
        </div>
      )}

      {/* Academy filter chips — '전체' chip 제거. 학원 chip 클릭으로 toggle. */}
      {showAcademyRow && active.length > 0 && (
        <div className="flex flex-wrap gap-2 items-center">
          {academiesWithItems.map((ac) => {
            const cnt = active.filter((it) => it.academyId === ac.id).length
            const isActive = academyFilter === ac.id
            return (
              <FilterChip
                key={ac.id}
                label={ac.name}
                count={cnt}
                href={academyHref(isActive ? null : ac.id)}
                active={isActive}
                dot={ac.color}
              />
            )
          })}
          {academyFilter !== null && (
            <span className="text-[11px] text-muted-foreground">탭 해제 = 전체</span>
          )}
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
            href={academyFilter ? academyHref(null) : '/dashboard'}
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
                <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-1 pt-1">
                  이번 주 숙제 · {allWeekHw.length}
                </h2>
                <Card className="p-0 gap-0 divide-y divide-foreground/10">
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
              // 내일 daily recurring은 filter='tomorrow' (내일만) / 'thisweek' (이번 주)
              // 에서만 노출. filter='today' / 'all' 덱에선 노이즈라 숨김.
              bk === 'tomorrow' && (filter === 'tomorrow' || filter === 'thisweek') ? tomorrowRecurringActive :
              []
            if (hwList.length === 0 && recurList.length === 0) return null
            const meta = BUCKET_META[bk]
            return (
              <section key={bk} className="space-y-2">
                <h2
                  className={cn(
                    'text-[11px] font-semibold uppercase tracking-wider px-1 pt-1',
                    meta.tone === 'destructive' && 'text-destructive',
                    meta.tone === 'today' && 'text-foreground',
                    !meta.tone && 'text-muted-foreground'
                  )}
                >
                  {meta.label} · {hwList.length + recurList.length}
                </h2>
                <Card className="p-0 gap-0 divide-y divide-foreground/10">
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
                      />
                    )
                  })}
                  {recurList.map((rt) => (
                    <RecurringItemRow
                      key={`r-${rt.id}`}
                      id={rt.id}
                      title={rt.title}
                      notes={rt.notes}
                      color={rt.color}
                      cadence={rt.cadence}
                      daysOfWeek={rt.daysOfWeek ?? []}
                      dateIso={rt.dateIso}
                      onComplete={onRecurringComplete}
                    />
                  ))}
                </Card>
              </section>
            )
          })}
          {(filter === 'today' || filter === 'tomorrow') && weeklySection}
          {nextWeekPreviewSection}
        </div>
      )}

      {/* 오늘 한 일 — today/all 필터에서만. tomorrow/nextweek/thisweek에선 표시 X. */}
      {(filter === 'today' || filter === 'all') && (doneToday.length > 0 || recurringDoneToday.length > 0) && (
        <details className="group rounded-xl bg-card ring-1 ring-foreground/10 overflow-hidden" open>
          <summary className="cursor-pointer select-none flex items-center justify-between px-4 py-3 text-sm font-semibold hover:bg-accent/40 transition-colors">
            <span className="flex items-center gap-2">
              <Check className="h-4 w-4 text-green-600" aria-hidden />
              오늘 한 일 ({doneToday.length + recurringDoneToday.length})
            </span>
            <span className="text-xs text-muted-foreground group-open:hidden">펼치기</span>
            <span className="text-xs text-muted-foreground hidden group-open:inline">접기</span>
          </summary>
          <div className="divide-y divide-foreground/10 border-t border-foreground/10">
            {doneToday.map((it) => (
              <HomeworkItem
                key={it.id}
                id={it.id}
                title={it.title}
                notes={it.notes}
                dueDate={it.dueDate}
                academyName={it.academyName}
                academyColor={it.academyColor}
                dueLabel={null}
                bucket="other"
                done
                doneRelativeLabel={it.doneAt ? formatRelative(it.doneAt, now) : null}
                onUndo={onUndo}
              />
            ))}
            {recurringDoneToday.map((rt) => (
              <div key={`r-${rt.id}`} className="px-4 py-3 flex items-center gap-3 opacity-60 hover:opacity-100 transition-opacity">
                <form action={onRecurringUndo} className="flex-shrink-0">
                  <input type="hidden" name="taskId" value={rt.id} />
                  <input type="hidden" name="dateIso" value={todayIso} />
                  <button
                    type="submit"
                    className="w-[22px] h-[22px] rounded-full bg-green-600 flex items-center justify-center hover:ring-2 hover:ring-red-400 hover:ring-offset-1 transition-all"
                    aria-label="완료 취소"
                  >
                    <Check className="h-3 w-3 text-white" strokeWidth={3} aria-hidden />
                  </button>
                </form>
                <span
                  className="w-[5px] h-9 rounded-full flex-shrink-0"
                  style={{ background: rt.color }}
                  aria-hidden
                />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-[15px] break-words leading-snug line-through decoration-muted-foreground/40">
                    {rt.title}
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                    <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold bg-muted text-muted-foreground">
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

      {/* 이번 주 완료한 숙제 — thisweek/all 필터에서만 표시. */}
      {(filter === 'thisweek' || filter === 'all') && doneThisWeek.length > 0 && (
        <details className="group rounded-xl bg-card ring-1 ring-foreground/10 overflow-hidden" open>
          <summary className="cursor-pointer select-none flex items-center justify-between px-4 py-3 text-sm font-semibold hover:bg-accent/40 transition-colors">
            <span className="flex items-center gap-2">
              <Check className="h-4 w-4 text-green-600" aria-hidden />
              이번 주 완료한 숙제 ({doneThisWeek.length})
            </span>
            <span className="text-xs text-muted-foreground group-open:hidden">펼치기</span>
            <span className="text-xs text-muted-foreground hidden group-open:inline">접기</span>
          </summary>
          <div className="divide-y divide-foreground/10 border-t border-foreground/10">
            {doneThisWeek.map((it) => (
              <HomeworkItem
                key={it.id}
                id={it.id}
                title={it.title}
                notes={it.notes}
                dueDate={it.dueDate}
                academyName={it.academyName}
                academyColor={it.academyColor}
                dueLabel={null}
                bucket="other"
                done
                doneRelativeLabel={it.doneAt ? formatRelative(it.doneAt, now) : null}
                onUndo={onUndo}
              />
            ))}
          </div>
        </details>
      )}

      {/* 완료한 이번 주 할일 (매주 recurring) — thisweek/all 필터에서만 표시. */}
      {(filter === 'thisweek' || filter === 'all') && weeklyDone.length > 0 && (
        <details className="group rounded-xl bg-card ring-1 ring-foreground/10 overflow-hidden" open>
          <summary className="cursor-pointer select-none flex items-center justify-between px-4 py-3 text-sm font-semibold hover:bg-accent/40 transition-colors">
            <span className="flex items-center gap-2">
              <Check className="h-4 w-4 text-violet-600" aria-hidden />
              완료한 이번 주 할일 ({weeklyDone.length})
            </span>
            <span className="text-xs text-muted-foreground group-open:rotate-180 transition-transform">▾</span>
          </summary>
          <div className="divide-y divide-foreground/10 border-t border-foreground/10">
            {weeklyDone.map((rt) => (
              <div key={`wd-${rt.id}`} className="px-4 py-3 flex items-center gap-3 opacity-60 hover:opacity-100 transition-opacity">
                <form action={onRecurringUndo} className="flex-shrink-0">
                  <input type="hidden" name="taskId" value={rt.id} />
                  <input type="hidden" name="dateIso" value={rt.dateIso} />
                  <button
                    type="submit"
                    className="w-[22px] h-[22px] rounded-full bg-violet-600 flex items-center justify-center hover:ring-2 hover:ring-red-400 hover:ring-offset-1 transition-all"
                    aria-label="완료 취소"
                  >
                    <Check className="h-3 w-3 text-white" strokeWidth={3} aria-hidden />
                  </button>
                </form>
                <span
                  className="w-[5px] h-9 rounded-full flex-shrink-0"
                  style={{ background: rt.color }}
                  aria-hidden
                />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-[15px] break-words leading-snug line-through decoration-muted-foreground/40">
                    {rt.title}
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                    <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold bg-violet-100 text-violet-700">
                      🔁 이번 주 안에
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
