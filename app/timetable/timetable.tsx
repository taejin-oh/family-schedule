import Link from 'next/link'
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

type SlotBlock = {
  academyName: string
  color: string
  spanRows: number
}

// Build a 2D structure: cells[rowIdx][dayIdx] = { block | 'skip' | null }
// 'skip' = this cell is covered by a rowSpan block that started above
function buildCells(academies: Academy[]) {
  // cells[row][dayIdx]: null = empty, SlotBlock = block starts here, 'skip' = covered
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

      // Place block (if cell not already occupied)
      if (cells[startRow][dayIdx] === null) {
        cells[startRow][dayIdx] = {
          academyName: academy.name,
          color: academy.color,
          spanRows,
        }
        // Mark covered rows as 'skip'
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

export function Timetable({ academies }: { academies: Academy[] }) {
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

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">주간 시간표</h1>
        <p className="text-sm text-muted-foreground mt-1">이번 주 학원 일정</p>
      </div>

      <div className="overflow-x-auto">
        <table className="border-collapse text-sm" style={{ minWidth: '600px' }}>
          <thead>
            <tr>
              <th className="w-14 text-right pr-2 font-normal text-muted-foreground text-xs" />
              {DAYS.map((d) => (
                <th
                  key={d.key}
                  className={cn(
                    'w-24 text-center py-2 font-semibold border border-border',
                    d.key === todayKey && 'bg-primary/10',
                  )}
                >
                  {d.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cells.map((row, rowIdx) => (
              <tr key={rowIdx} className="h-7">
                {/* Time label — only on even rows (whole hours) */}
                <td className="text-right pr-2 text-xs text-muted-foreground align-top pt-0.5 whitespace-nowrap">
                  {rowIdx % 2 === 0 ? rowIndexToLabel(rowIdx) : ''}
                </td>
                {row.map((cell, dayIdx) => {
                  const dayKey = DAYS[dayIdx].key
                  const todayBg = dayKey === todayKey ? 'bg-primary/5' : ''

                  if (cell === 'skip') {
                    // This cell is covered by a rowSpan above — omit the <td>
                    return null
                  }

                  if (cell === null) {
                    return (
                      <td
                        key={dayKey}
                        className={cn('border border-border', todayBg)}
                      />
                    )
                  }

                  // SlotBlock
                  const rowSpan = Math.min(cell.spanRows, TOTAL_ROWS - rowIdx)
                  return (
                    <td
                      key={dayKey}
                      rowSpan={rowSpan}
                      className={cn('border border-border align-top p-0', todayBg)}
                    >
                      <div
                        className="w-full px-1 py-0.5 text-white text-xs font-medium overflow-hidden leading-tight"
                        style={{
                          backgroundColor: cell.color,
                          minHeight: `${rowSpan * 28}px`,
                        }}
                      >
                        {cell.academyName}
                      </div>
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
