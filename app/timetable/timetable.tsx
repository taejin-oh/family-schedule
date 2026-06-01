'use client'

import { useLayoutEffect, useRef } from 'react'
import Link from 'next/link'
import { Check } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { textOn } from '@/lib/contrast'

type ScheduleSlot = { day: string; start: string; end: string }
type Academy = {
  id: number
  name: string
  color: string
  scheduleRule: { slots: ScheduleSlot[] } | null
}
type WeeklyProgress = {
  academyId: number
  name: string
  color: string
  total: number
  done: number
}
type SlotProgress = Record<string, { total: number; done: number }>  // key = `${academyId}|YYYY-MM-DD`

const DAYS: Array<{ key: string; label: string }> = [
  { key: 'mon', label: '월' },
  { key: 'tue', label: '화' },
  { key: 'wed', label: '수' },
  { key: 'thu', label: '목' },
  { key: 'fri', label: '금' },
  { key: 'sat', label: '토' },
  { key: 'sun', label: '일' },
]

// Map JS getDay() (0=Sun…6=Sat) to our day keys
const JS_DAY_TO_KEY: Record<number, string> = {
  0: 'sun', 1: 'mon', 2: 'tue', 3: 'wed', 4: 'thu', 5: 'fri', 6: 'sat',
}

const START_HOUR = 6   // 06:00
const END_HOUR = 23    // 23:00 (그리드 끝)

const ROW_PX = 32                        // 30분당 픽셀 높이
const PX_PER_MIN = ROW_PX / 30
const GRID_START_MIN = START_HOUR * 60   // 360
const GRID_END_MIN = END_HOUR * 60       // 1380
const TOTAL_MIN = GRID_END_MIN - GRID_START_MIN
const GRID_HEIGHT = TOTAL_MIN * PX_PER_MIN
// 정시 라벨 (06,07,...,23)
const HOUR_LABELS: number[] = Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => START_HOUR + i)

/** "HH:MM" → 자정 기준 분 */
function toMin(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

/** 분 → 그리드 상단 기준 px (블록·라벨·현재시각선 모두 이 한 함수로 정렬) */
function yOf(min: number): number {
  return (min - GRID_START_MIN) * PX_PER_MIN
}

function localDateIso(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Compute the YYYY-MM-DD this week for a given day key (mon..sun). */
function dateForDay(weekStart: Date | undefined, dayKey: string): string | null {
  if (!weekStart) return null
  const idx = DAYS.findIndex((d) => d.key === dayKey)
  if (idx === -1) return null
  const d = new Date(weekStart)
  d.setDate(d.getDate() + idx)
  return localDateIso(d)
}

type DayBlock = {
  academyId: number
  academyName: string
  color: string
  startTime: string
  endTime: string
  startMin: number
  endMin: number
}

/**
 * 요일별 학원 블록 목록. 30분 격자에 스냅하지 않고 실제 시각(분)을 그대로 보존 →
 * 16:50 시작은 16:50 위치에 그려진다 (이전 rowSpan 방식은 16:30으로 스냅됐음).
 */
function buildBlocksByDay(academies: Academy[]): DayBlock[][] {
  return DAYS.map((d) =>
    academies.flatMap((a) =>
      (a.scheduleRule?.slots ?? [])
        .filter((s) => s.day === d.key)
        .map((s) => ({
          academyId: a.id,
          academyName: a.name,
          color: a.color,
          startTime: s.start,
          endTime: s.end,
          startMin: toMin(s.start),
          endMin: toMin(s.end),
        }))
        .filter((b) => b.endMin > b.startMin),
    ),
  )
}

function formatWeekRange(monday: Date): string {
  const sunday = new Date(monday); sunday.setDate(sunday.getDate() + 6)
  const m1 = String(monday.getMonth() + 1).padStart(2, '0')
  const d1 = String(monday.getDate()).padStart(2, '0')
  const m2 = String(sunday.getMonth() + 1).padStart(2, '0')
  const d2 = String(sunday.getDate()).padStart(2, '0')
  return `${m1}/${d1} – ${m2}/${d2}`
}

export function Timetable({
  academies,
  weeklyProgress = [],
  weekStart,
  slotProgress = {},
}: {
  academies: Academy[]
  weeklyProgress?: WeeklyProgress[]
  weekStart?: Date
  slotProgress?: SlotProgress
}) {
  // Hooks must be called unconditionally — declare before any early return.
  // 현재시각 빨간 선: 블록·라벨과 동일한 yOf(분) 공식으로 위치 → 항상 정확히 정렬.
  // "지금"은 클라이언트 시각이라 mount 후 effect에서 설정(SSR 하이드레이션 불일치 회피).
  const indicatorRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    function compute() {
      const indicator = indicatorRef.current
      if (!indicator) return
      const now = new Date()
      const nowMin = now.getHours() * 60 + now.getMinutes()
      if (nowMin < GRID_START_MIN || nowMin >= GRID_END_MIN) {
        indicator.style.display = 'none'
        return
      }
      indicator.style.top = `${yOf(nowMin)}px`
      indicator.style.display = ''
    }
    compute()
    const intervalId = window.setInterval(compute, 60_000)
    return () => window.clearInterval(intervalId)
  }, [])

  const hasSlots = academies.some(
    (a) => a.scheduleRule?.slots && a.scheduleRule.slots.length > 0,
  )

  if (!hasSlots) {
    return (
      <div className="space-y-4">
        <header className="px-1 pt-2 pb-1">
          <h1 className="text-[30px] leading-tight font-bold tracking-tight">시간표</h1>
          <p className="text-sm text-muted-foreground mt-0.5">이번 주 학원 일정</p>
        </header>
        <Card className="p-8 text-center text-muted-foreground">
          <p>등록된 학원 시간이 없습니다.</p>
          <Link href="/academies/new" className={cn(buttonVariants({ variant: 'outline' }), 'mt-4')}>
            학원 등록하기
          </Link>
        </Card>
      </div>
    )
  }

  const blocksByDay = buildBlocksByDay(academies)
  const todayKey = JS_DAY_TO_KEY[new Date().getDay()]

  // 진행칩을 한 번만 만들어 lg(헤더 우측)·모바일(sticky row) 두 곳에서 재사용.
  const progressChips =
    weeklyProgress.length > 0
      ? weeklyProgress.map((p) => {
          const done = p.done === p.total && p.total > 0
          const pct = p.total === 0 ? 0 : Math.round((p.done / p.total) * 100)
          return (
            <Link
              key={p.academyId}
              href={`/academies/${p.academyId}`}
              prefetch
              className={cn(
                'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-card text-sm transition-colors hover:bg-accent',
                done && 'ring-1 ring-good/40',
              )}
              title={`${p.name}: ${p.done}/${p.total}개 완료 (${pct}%)`}
            >
              <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
              <span className="font-semibold">{p.name}</span>
              <span className="text-xs text-muted-foreground tabular-nums">
                {p.done}/{p.total}
              </span>
              {done && <Check className="h-3.5 w-3.5 text-good" aria-hidden />}
            </Link>
          )
        })
      : null

  return (
    <div className="space-y-4">
      {/* 헤더 — lg에서 제목 좌 / 학원 진행칩 우측 정렬 */}
      <header className="px-1 pt-2 pb-1 lg:flex lg:items-end lg:justify-between lg:gap-4">
        <div>
          <h1 className="text-[30px] lg:text-[34px] leading-tight font-bold tracking-tight">시간표</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            이번 주 학원 일정{weekStart ? ` · ${formatWeekRange(weekStart)}` : ''}
          </p>
        </div>
        {progressChips && (
          <div className="hidden lg:flex lg:flex-wrap lg:justify-end lg:gap-2 lg:max-w-[62%]">
            {progressChips}
          </div>
        )}
      </header>

      {/* 모바일 — 진행칩 sticky row (lg에서는 헤더로 이동) */}
      {progressChips && (
        <div className="space-y-1.5 sticky top-0 z-10 bg-background py-2 -my-2 lg:hidden">
          <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-1">
            이번 주 숙제 진행
          </div>
          <div className="flex flex-wrap gap-2">{progressChips}</div>
        </div>
      )}

      <Card className="p-2 overflow-x-auto">
        {/* 요일 헤더 */}
        <div className="flex">
          <div className="w-10 sm:w-12 shrink-0" />
          {DAYS.map((d) => (
            <div
              key={d.key}
              className={cn(
                'flex-1 flex justify-center py-2 border-b border-foreground/10',
                d.key === todayKey && 'bg-brand-soft rounded-t-md',
              )}
            >
              <span
                className={cn(
                  'inline-flex w-7 h-7 items-center justify-center rounded-full text-[11px] font-bold',
                  d.key === todayKey ? 'bg-brand text-brand-foreground' : 'text-foreground/80',
                )}
              >
                {d.label}
              </span>
            </div>
          ))}
        </div>

        {/* 그리드 본문 — 분 단위 절대 배치 */}
        <div className="flex" style={{ height: GRID_HEIGHT }}>
          {/* 시간 라벨 컬럼 */}
          <div className="w-10 sm:w-12 shrink-0 relative">
            {HOUR_LABELS.map((h) => (
              <div
                key={h}
                className="absolute right-2 -translate-y-1/2 text-[10px] text-muted-foreground tabular-nums whitespace-nowrap"
                style={{ top: yOf(h * 60) }}
              >
                {String(h).padStart(2, '0')}:00
              </div>
            ))}
          </div>

          {/* 요일 컬럼 영역 — 30분 격자선은 배경 그라디언트로 (블록 뒤) */}
          <div
            className="flex-1 relative"
            style={{
              backgroundImage: `repeating-linear-gradient(to bottom, color-mix(in srgb, var(--foreground) 6%, transparent) 0, color-mix(in srgb, var(--foreground) 6%, transparent) 1px, transparent 1px, transparent ${ROW_PX}px)`,
            }}
          >
            <div className="absolute inset-0 grid grid-cols-7">
              {DAYS.map((d, dayIdx) => (
                <div
                  key={d.key}
                  className={cn(
                    'relative border-l border-foreground/5',
                    d.key === todayKey && 'bg-brand-soft/40',
                  )}
                >
                  {blocksByDay[dayIdx].map((b, i) => {
                    // 그리드 범위로 클램프 (범위 밖 부분은 잘라서 표시)
                    const vis0 = Math.max(b.startMin, GRID_START_MIN)
                    const vis1 = Math.min(b.endMin, GRID_END_MIN)
                    if (vis1 <= vis0) return null
                    const top = yOf(vis0)
                    const height = (vis1 - vis0) * PX_PER_MIN
                    const slotDate = dateForDay(weekStart, d.key)
                    const progress = slotDate ? slotProgress[`${b.academyId}|${slotDate}`] : undefined
                    const allDone = !!progress && progress.total > 0 && progress.done === progress.total
                    const isDark = textOn(b.color) === 'white'
                    const inner = (
                      <div
                        className={cn(
                          'w-full h-full px-1.5 py-1 text-[13px] font-bold overflow-hidden leading-tight flex flex-col gap-0.5 rounded-md',
                          isDark ? 'text-white' : 'text-black',
                        )}
                        style={{ backgroundColor: b.color }}
                      >
                        <div className="truncate">{b.academyName}</div>
                        {/* lg: 시간 범위 — 60분 이상 블록만 (공간 있을 때) */}
                        {height >= 52 && (
                          <div className={cn(
                            'hidden lg:block text-[11px] tabular-nums font-semibold leading-none',
                            isDark ? 'opacity-80' : 'opacity-70',
                          )}>
                            {b.startTime}–{b.endTime}
                          </div>
                        )}
                        {progress && progress.total > 0 && (
                          <div
                            className={cn(
                              'inline-flex items-center gap-1 self-start px-1.5 py-0 rounded-full text-[10px] tabular-nums font-bold',
                              allDone
                                ? (isDark ? 'bg-white text-good' : 'bg-good text-white')
                                : progress.done === 0
                                  ? (isDark ? 'bg-white/25 text-white' : 'bg-black/15 text-black')
                                  : (isDark ? 'bg-white/85 text-foreground' : 'bg-black/80 text-white'),
                            )}
                          >
                            {allDone && <Check className="h-2.5 w-2.5" aria-hidden />}
                            {progress.done}/{progress.total}
                          </div>
                        )}
                      </div>
                    )
                    return (
                      <div
                        key={i}
                        className="absolute inset-x-[2px]"
                        style={{ top: top + 1, height: Math.max(height - 2, 14) }}
                      >
                        {slotDate ? (
                          <Link
                            href={`/academies/${b.academyId}?date=${slotDate}`}
                            prefetch
                            className="block w-full h-full hover:opacity-90 transition-opacity"
                            title={`${b.academyName} · ${b.startTime}–${b.endTime}`}
                          >
                            {inner}
                          </Link>
                        ) : (
                          inner
                        )}
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>

            {/* 현재시각 인디케이터 — 블록과 동일 좌표계(yOf) */}
            <div
              ref={indicatorRef}
              aria-hidden
              className="absolute inset-x-0 pointer-events-none z-10"
              style={{ top: '0px', display: 'none' }}
            >
              <div className="relative h-[2px] bg-destructive/80">
                <div className="absolute -left-1 top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-destructive" />
              </div>
            </div>
          </div>
        </div>
      </Card>
    </div>
  )
}
