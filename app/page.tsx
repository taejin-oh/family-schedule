import Link from 'next/link'
import { revalidatePath } from 'next/cache'
import { Check, ArrowRight } from 'lucide-react'
import { listCommittedItems, listDoneToday, toggleItemDone } from '@/server/actions/homework'
import { listTodayRecurring, listThisWeekRecurring, markRecurringDone, markRecurringUndone } from '@/server/actions/recurring'
import { getStickerState, redeem } from '@/server/actions/stickers'
import { Card } from '@/components/ui/card'
import { localDateIso } from '@/server/util/date'
import { KidsTodoCard } from '@/app/_components/kids-todo-card'
import { KidsDoneCard } from '@/app/_components/kids-done-card'
import { KidsRecurringTodoCard, KidsRecurringDoneCard } from '@/app/_components/kids-recurring-card'
import { StickersRow } from '@/app/_components/stickers-row'

const DAY_KO = ['일', '월', '화', '수', '목', '금', '토']

function diffDays(due: string, todayIso: string): number {
  const t = new Date(todayIso + 'T00:00:00')
  const d = new Date(due + 'T00:00:00')
  return Math.round((d.getTime() - t.getTime()) / 86_400_000)
}

function weekdayLabel(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return `${DAY_KO[new Date(y, m - 1, d).getDay()]}요일`
}

export default async function KidsHome() {
  const [active, doneToday, todayRec, weekRec, sticker] = await Promise.all([
    listCommittedItems(),
    listDoneToday(),
    listTodayRecurring(),
    listThisWeekRecurring(),
    getStickerState(),
  ])
  const todayIso = localDateIso()

  // 오늘 해야 할 일 = overdue + today bucket homework
  const todayList = active.filter((it) => {
    if (!it.dueDate) return false
    return diffDays(it.dueDate, todayIso) <= 0
  })

  // 매일 recurring (오늘 due) — 스티커 평가에 포함
  const dailyTodayActive = todayRec.filter((r) => r.doneAt === null)
  const dailyTodayDone = todayRec.filter((r) => r.doneAt !== null)

  // 매주 recurring — 이번 주 단위. 스티커 평가에서 제외, 별도 섹션에 표시
  const weeklyActive = weekRec.filter((r) => r.doneAt === null)
  const weeklyDone = weekRec.filter((r) => r.doneAt !== null)
  const weeklyTotal = weeklyActive.length + weeklyDone.length

  // 이번 주 남은 (오늘 이후 ~ 이번 주 일요일까지 마감 homework)
  const todayDate = new Date(todayIso + 'T00:00:00')
  const dow = todayDate.getDay()
  const daysUntilThisSunday = (7 - dow) % 7  // today=Sunday → 0
  const upcoming = active.filter((it) => {
    if (!it.dueDate) return false
    const dd = diffDays(it.dueDate, todayIso)
    return dd >= 1 && dd <= daysUntilThisSunday
  })
  const upcomingByDay = new Map<string, typeof upcoming>()
  for (const it of upcoming) {
    if (!it.dueDate) continue
    if (!upcomingByDay.has(it.dueDate)) upcomingByDay.set(it.dueDate, [])
    upcomingByDay.get(it.dueDate)!.push(it)
  }
  const upcomingDates = [...upcomingByDay.keys()].sort()

  // 진행률 (오늘 단위) — 매주는 별도 섹션, 스티커 평가에서도 제외되므로 여기서도 제외
  const totalActive = todayList.length + dailyTodayActive.length
  const totalDone = doneToday.length + dailyTodayDone.length
  const total = totalActive + totalDone
  const pct = total === 0 ? 100 : Math.round((totalDone / total) * 100)

  // Server actions
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
  async function onRecComplete(formData: FormData) {
    'use server'
    const taskId = Number(formData.get('taskId'))
    const dateIso = String(formData.get('dateIso'))
    await markRecurringDone(taskId, dateIso)
    revalidatePath('/')
    revalidatePath('/dashboard')
    revalidatePath('/recurring')
  }
  async function onRecUndo(formData: FormData) {
    'use server'
    const taskId = Number(formData.get('taskId'))
    const dateIso = String(formData.get('dateIso'))
    await markRecurringUndone(taskId, dateIso)
    revalidatePath('/')
    revalidatePath('/dashboard')
    revalidatePath('/recurring')
  }
  async function onRedeem() {
    'use server'
    const res = await redeem()
    if (!res.ok) throw new Error(res.error)
    revalidatePath('/')
    revalidatePath('/admin/settings')
  }

  // v6 헤더용 날짜 라벨
  const [ty, tm, td] = todayIso.split('-').map(Number)
  const todayDow = new Date(ty, tm - 1, td).getDay()
  const todaySub = `${tm}월 ${td}일 · ${DAY_KO[todayDow]}요일`

  return (
    <div className="space-y-4">
      {/* 상단 헤더 — Apple Reminders 톤 */}
      <header className="px-1 pt-2 pb-1 flex items-end justify-between gap-2">
        <div>
          <h1 className="text-[34px] leading-tight font-bold tracking-tight">오늘</h1>
          <div className="text-sm text-muted-foreground mt-0.5">
            {todaySub} · {totalActive > 0 ? `${totalActive}개 남음` : '오늘 끝!'}
          </div>
        </div>
        <Link
          href="/dashboard"
          className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-0.5 shrink-0 pb-1.5"
        >
          관리 <ArrowRight className="h-3 w-3" />
        </Link>
      </header>

      {/* 스티커 보상 */}
      <StickersRow
        reward={sticker.reward}
        count={sticker.count}
        canRedeem={sticker.canRedeem}
        onRedeem={onRedeem}
      />

      {/* 진행 카드 — v6 inline */}
      <Card className="p-4 gap-2">
        <div className="flex items-center gap-4">
          <div className="text-[40px] leading-none font-bold tabular-nums">{totalActive}</div>
          <div className="flex-1 min-w-0">
            <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              REMAINING
            </div>
            <div className="text-sm font-medium mt-0.5">
              완료 {totalDone} / 전체 {total}
            </div>
          </div>
          <div className="text-sm text-muted-foreground tabular-nums shrink-0">{pct}%</div>
        </div>
        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-foreground transition-all"
            style={{ width: `${pct}%` }}
            aria-hidden
          />
        </div>
      </Card>

      {/* 오늘 해야 할 숙제 */}
      {totalActive > 0 ? (
        <section className="space-y-2">
          <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-1 pt-1">
            오늘 해야 할 숙제
          </h2>
          <div className="space-y-2">
            {todayList.map((it) => (
              <KidsTodoCard
                key={it.id}
                id={it.id}
                title={it.title}
                academyName={it.academyName}
                academyColor={it.academyColor}
                dueDate={it.dueDate}
                todayIso={todayIso}
                onComplete={onComplete}
              />
            ))}
            {dailyTodayActive.map((rt) => (
              <KidsRecurringTodoCard
                key={`d-${rt.id}`}
                id={rt.id}
                title={rt.title}
                color={rt.color}
                cadence="daily"
                dateIso={todayIso}
                notes={rt.notes}
                daysOfWeek={rt.daysOfWeek}
                onComplete={onRecComplete}
              />
            ))}
          </div>
        </section>
      ) : (
        <Card className="p-8 text-center space-y-1.5">
          <div className="text-3xl">🎉</div>
          <div className="font-semibold">오늘 할 일이 없어요!</div>
          <div className="text-xs text-muted-foreground">잘했어!</div>
        </Card>
      )}

      {/* 완료한 숙제 */}
      {totalDone > 0 && (
        <section className="space-y-2">
          <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-1 pt-1 inline-flex items-center gap-1.5">
            <Check className="h-3.5 w-3.5 text-green-600" aria-hidden />
            <span>완료한 숙제 ({totalDone})</span>
          </h2>
          <div className="space-y-2">
            {doneToday.map((it) => (
              <KidsDoneCard
                key={it.id}
                id={it.id}
                title={it.title}
                academyName={it.academyName}
                academyColor={it.academyColor}
                onUndo={onUndo}
              />
            ))}
            {dailyTodayDone.map((rt) => (
              <KidsRecurringDoneCard
                key={`dd-${rt.id}`}
                id={rt.id}
                title={rt.title}
                color={rt.color}
                cadence="daily"
                dateIso={todayIso}
                onUndo={onRecUndo}
              />
            ))}
          </div>
        </section>
      )}

      {/* 이번 주 안에 할 일 (매주 recurring) — 스티커 무관 */}
      {weeklyTotal > 0 && (
        <section className="space-y-2">
          <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-1 pt-1">
            이번 주 안에 할 일 · {weeklyDone.length} / {weeklyTotal}
          </h2>
          <div className="space-y-2">
            {weeklyActive.map((rt) => (
              <KidsRecurringTodoCard
                key={`w-${rt.id}`}
                id={rt.id}
                title={rt.title}
                color={rt.color}
                cadence="weekly"
                dateIso={todayIso}
                notes={rt.notes}
                onComplete={onRecComplete}
              />
            ))}
            {weeklyDone.map((rt) => (
              <KidsRecurringDoneCard
                key={`wd-${rt.id}`}
                id={rt.id}
                title={rt.title}
                color={rt.color}
                cadence="weekly"
                dateIso={todayIso}
                onUndo={onRecUndo}
              />
            ))}
          </div>
        </section>
      )}

      {/* 이번 주 남은 숙제 (작게) */}
      {upcomingDates.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-1 pt-1">
            이번 주 남은 숙제 · {upcoming.length}개
          </h2>
          <Card className="p-0 gap-0 divide-y divide-foreground/10">
            {upcomingDates.map((d) => {
              const items = upcomingByDay.get(d)!
              return (
                <Link
                  key={d}
                  href={`/day/${d}`}
                  className="px-4 py-3 flex items-center gap-3 hover:bg-accent/40 active:bg-accent/60 transition-colors"
                >
                  <span className="text-sm font-medium w-14 flex-shrink-0">{weekdayLabel(d)}</span>
                  <span className="text-sm text-muted-foreground flex-1">{items.length}개</span>
                  <ArrowRight className="h-4 w-4 text-muted-foreground flex-shrink-0" aria-hidden />
                </Link>
              )
            })}
          </Card>
        </section>
      )}
    </div>
  )
}
