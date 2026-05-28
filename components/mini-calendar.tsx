'use client'

import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

const DOW = ['일', '월', '화', '수', '목', '금', '토']

function parseIso(iso: string): { y: number; m: number; d: number } {
  const [y, m, d] = iso.split('-').map(Number)
  return { y, m, d }
}

function toIso(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/**
 * 미루기 sheet에 들어가는 미니 달력. 한 달치 7×6 그리드.
 *
 * - 오늘 셀: violet ring + 글씨 강조 (별도 표시 — 사용자 요청).
 * - 선택 셀: foreground 채움.
 * - minIso 이전 셀: 비활성 (과거 날짜로 미루기 차단).
 */
export function MiniCalendar({
  selected,
  onSelect,
  todayIso,
  minIso,
}: {
  selected: string | null
  onSelect: (iso: string) => void
  todayIso: string
  /** 이 ISO 이전 날짜는 비활성. 보통 내일(addDays(today,1)). */
  minIso: string
}) {
  const initial = selected ? parseIso(selected) : parseIso(todayIso)
  const [view, setView] = useState({ y: initial.y, m: initial.m })

  const firstDay = new Date(view.y, view.m - 1, 1)
  const startDow = firstDay.getDay() // 0=Sun
  const lastDay = new Date(view.y, view.m, 0).getDate()

  // 7×6 = 42셀 (안정적 높이)
  const cells: (number | null)[] = []
  for (let i = 0; i < startDow; i++) cells.push(null)
  for (let d = 1; d <= lastDay; d++) cells.push(d)
  while (cells.length < 42) cells.push(null)

  function prev() {
    setView((p) => (p.m === 1 ? { y: p.y - 1, m: 12 } : { y: p.y, m: p.m - 1 }))
  }
  function next() {
    setView((p) => (p.m === 12 ? { y: p.y + 1, m: 1 } : { y: p.y, m: p.m + 1 }))
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={prev}
          aria-label="이전 달"
          className="h-9 w-9 inline-flex items-center justify-center rounded hover:bg-accent"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </button>
        <div className="font-semibold text-base">
          {view.y}년 {view.m}월
        </div>
        <button
          type="button"
          onClick={next}
          aria-label="다음 달"
          className="h-9 w-9 inline-flex items-center justify-center rounded hover:bg-accent"
        >
          <ChevronRight className="h-4 w-4" aria-hidden />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold text-muted-foreground">
        {DOW.map((d) => (
          <div key={d}>{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map((day, i) => {
          if (day === null) return <div key={i} className="h-10" />
          const iso = toIso(view.y, view.m, day)
          const isToday = iso === todayIso
          const isSelected = iso === selected
          const isDisabled = iso < minIso
          return (
            <button
              key={i}
              type="button"
              disabled={isDisabled}
              onClick={() => onSelect(iso)}
              className={cn(
                'h-10 w-full rounded-md text-sm flex items-center justify-center transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                isDisabled && 'opacity-30 cursor-not-allowed',
                !isDisabled && !isSelected && 'hover:bg-accent',
                isToday && !isSelected && 'ring-2 ring-violet-500 text-violet-700 font-bold',
                isSelected && 'bg-foreground text-background font-semibold ring-0',
              )}
            >
              {day}
            </button>
          )
        })}
      </div>
    </div>
  )
}
