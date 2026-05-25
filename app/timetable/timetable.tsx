'use client'

import { useEffect, useRef } from 'react'
import Link from 'next/link'
import { Check } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

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
const END_HOUR = 23    // 34 rows total (06:00–22:30)
const TOTAL_ROWS = (END_HOUR - START_HOUR) * 2

function timeToRowIndex(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return (h - START_HOUR) * 2 + (m >= 30 ? 1 : 0)
}

function rowIndexToLabel(row: number): string {
  const totalMinutes = START_HOUR * 60 + row * 30
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
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

type SlotBlock = {
  academyId: number
  academyName: string
  color: string
  spanRows: number
  dayKey: string
}

// Build a 2D structure: cells[rowIdx][dayIdx] = { block | 'skip' | null }
function buildCells(academies: Academy[]) {
  const cells: Array<Array<SlotBlock | 'skip' | null>> = Array.from(
    { length: TOTAL_ROWS },
    () => Array(DAYS.length).fill(null),
  )

  for (const academy of academies) {
    if (!academy.scheduleRule?.slots) continue
    for (const slot of academy.scheduleRule.slots) {
      const dayIdx = DAYS.findIndex((d) => d.key === slot.day)
      if (dayIdx === -1) continue
      const startRow = timeToRowIndex(slot.start)
      const endRow = timeToRowIndex(slot.end)
      const spanRows = Math.max(1, Math.min(endRow - startRow, TOTAL_ROWS - startRow))
      if (startRow < 0 || startRow >= TOTAL_ROWS) continue

      if (cells[startRow][dayIdx] === null) {
        cells[startRow][dayIdx] = {
          academyId: academy.id,
          academyName: academy.name,
          color: academy.color,
          spanRows,
          dayKey: slot.day,
        }
        for (let r = startRow + 1; r < startRow + spanRows && r < TOTAL_ROWS; r++) {
          if (cells[r][dayIdx] === null) {
            cells[r][dayIdx] = 'skip'
          }
        }
      }
    }
  }

  return cells
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
  const hasSlots = academies.some(
    (a) => a.scheduleRule?.slots && a.scheduleRule.slots.length > 0,
  )

  if (!hasSlots) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">주간 시간표</h1>
          <p className="text-sm text-muted-foreground mt-1">이번 주 학원 일정</p>
        </div>
        <Card className="p-8 text-center text-muted-foreground">
          <p>등록된 학원 시간이 없습니다.</p>
          <Link href="/academies/new" className={cn(buttonVariants({ variant: 'outline' }), 'mt-4')}>
            학원 등록하기
          </Link>
        </Card>
      </div>
    )
  }

  const cells = buildCells(academies)
  const todayKey = JS_DAY_TO_KEY[new Date().getDay()]

  // Earliest schedule start row across all academies — used for auto-scroll
  let earliestRowIdx = -1
  for (const a of academies) {
    for (const s of a.scheduleRule?.slots ?? []) {
      const ri = timeToRowIndex(s.start)
      if (ri < 0) continue
      if (earliestRowIdx === -1 || ri < earliestRowIdx) earliestRowIdx = ri
    }
  }

  const tbodyRef = useRef<HTMLTableSectionElement>(null)
  useEffect(() => {
    if (earliestRowIdx < 1) return  // already at top
    const row = tbodyRef.current?.querySelectorAll('tr')[earliestRowIdx]
    row?.scrollIntoView({ block: 'start', behavior: 'auto' })
  }, [earliestRowIdx])

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">주간 시간표</h1>
        <p className="text-sm text-muted-foreground mt-1">
          이번 주 학원 일정{weekStart ? ` · ${formatWeekRange(weekStart)}` : ''}
        </p>
      </div>

      {/* Weekly homework progress per academy — sticky so it stays visible while scrolling */}
      {weeklyProgress.length > 0 && (
        <div className="space-y-1.5 sticky top-0 z-10 bg-background py-2 -my-2">
          <div className="text-xs text-muted-foreground px-1">이번 주 숙제 진행</div>
          <div className="flex flex-wrap gap-2">
            {weeklyProgress.map((p) => {
              const done = p.done === p.total && p.total > 0
              const pct = p.total === 0 ? 0 : Math.round((p.done / p.total) * 100)
              return (
                <Link
                  key={p.academyId}
                  href={`/academies/${p.academyId}`}
                  className={cn(
                    'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm transition-colors hover:bg-accent',
                    done ? 'border-green-500/40' : 'border-foreground/10',
                  )}
                  title={`${p.name}: ${p.done}/${p.total}개 완료 (${pct}%)`}
                >
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: p.color }} />
                  <span className="font-medium">{p.name}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {p.done}/{p.total}
                  </span>
                  {done && <Check className="h-3.5 w-3.5 text-green-600" aria-hidden />}
                </Link>
              )
            })}
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm table-fixed">
          <thead>
            <tr>
              <th className="w-10 sm:w-14 text-right pr-1 sm:pr-2 font-normal text-muted-foreground text-xs" />
              {DAYS.map((d) => (
                <th
                  key={d.key}
                  className={cn(
                    'text-center py-2 font-semibold border border-border',
                    d.key === todayKey && 'bg-primary/10',
                  )}
                >
                  {d.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody ref={tbodyRef}>
            {cells.map((row, rowIdx) => (
              <tr key={rowIdx} className="h-7">
                <td className="text-right pr-2 text-xs text-muted-foreground align-top pt-0.5 whitespace-nowrap">
                  {rowIdx % 2 === 0 ? rowIndexToLabel(rowIdx) : ''}
                </td>
                {row.map((cell, dayIdx) => {
                  const dayKey = DAYS[dayIdx].key
                  const todayBg = dayKey === todayKey ? 'bg-primary/5' : ''

                  if (cell === 'skip') return null

                  if (cell === null) {
                    return (
                      <td
                        key={dayKey}
                        className={cn('border border-border', todayBg)}
                      />
                    )
                  }

                  const rowSpan = Math.min(cell.spanRows, TOTAL_ROWS - rowIdx)
                  const slotDate = dateForDay(weekStart, cell.dayKey)
                  const progress = slotDate ? slotProgress[`${cell.academyId}|${slotDate}`] : undefined
                  const allDone = !!progress && progress.total > 0 && progress.done === progress.total
                  const inner = (
                    <div
                      className="w-full h-full px-1.5 py-1 text-white text-xs font-medium overflow-hidden leading-tight flex flex-col gap-0.5"
                      style={{
                        backgroundColor: cell.color,
                        minHeight: `${rowSpan * 28}px`,
                      }}
                    >
                      <div className="truncate">{cell.academyName}</div>
                      {progress && progress.total > 0 && (
                        <div
                          className={cn(
                            'inline-flex items-center gap-1 self-start px-1.5 py-0 rounded-full text-[10px] tabular-nums font-semibold',
                            allDone
                              ? 'bg-white/95 text-green-700'
                              : progress.done === 0
                                ? 'bg-white/25 text-white'
                                : 'bg-white/80 text-foreground',
                          )}
                        >
                          {allDone && <Check className="h-2.5 w-2.5" aria-hidden />}
                          {progress.done}/{progress.total}
                        </div>
                      )}
                    </div>
                  )

                  return (
                    <td
                      key={dayKey}
                      rowSpan={rowSpan}
                      className={cn('border border-border align-top p-0', todayBg)}
                    >
                      {slotDate ? (
                        <Link
                          href={`/academies/${cell.academyId}?date=${slotDate}`}
                          className="block h-full hover:opacity-90 transition-opacity"
                          title={`${cell.academyName} · ${slotDate}`}
                        >
                          {inner}
                        </Link>
                      ) : (
                        inner
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
