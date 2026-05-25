'use client'

import { useState, useTransition } from 'react'
import { CalendarClock } from 'lucide-react'
import { Menu } from '@base-ui/react/menu'
import { deferHomework } from '@/server/actions/homework'
import { cn } from '@/lib/utils'

function localDateIsoClient(d: Date = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return localDateIsoClient(d)
}

/** Next Saturday (if today is Saturday, next week Saturday) */
function nextSaturday(todayIso: string): string {
  const d = new Date(todayIso + 'T00:00:00')
  const dow = d.getDay() // 0=Sun,6=Sat
  const daysUntilSat = dow === 6 ? 7 : (6 - dow)
  d.setDate(d.getDate() + daysUntilSat)
  return localDateIsoClient(d)
}

/** Next Monday */
function nextMonday(todayIso: string): string {
  const d = new Date(todayIso + 'T00:00:00')
  const dow = d.getDay()
  const daysUntilMon = dow === 1 ? 7 : (1 - dow + 7) % 7 || 7
  d.setDate(d.getDate() + daysUntilMon)
  return localDateIsoClient(d)
}

type Props = {
  itemId: number
  currentDueDate: string | null
}

const POPUP_CLASS = cn(
  'z-50 min-w-[11rem] rounded-md border bg-popover shadow-md py-1 text-sm text-popover-foreground outline-none',
  'data-[starting-style]:opacity-0 data-[ending-style]:opacity-0 transition-opacity duration-100',
)
const ITEM_CLASS = cn(
  'relative flex cursor-default select-none items-center gap-3 px-3 py-1.5 outline-none w-full text-left',
  'focus:bg-accent focus:text-accent-foreground hover:bg-accent hover:text-accent-foreground',
  'data-[disabled]:pointer-events-none data-[disabled]:opacity-40',
)

export function DeferMenu({ itemId, currentDueDate }: Props) {
  const [open, setOpen] = useState(false)
  const [customDate, setCustomDate] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  const today = localDateIsoClient()
  const options = [
    { label: '내일', date: addDays(today, 1) },
    { label: '모레', date: addDays(today, 2) },
    { label: '이번 주말 (토)', date: nextSaturday(today) },
    { label: '다음 주 월요일', date: nextMonday(today) },
  ]

  function doDefer(newDueDate: string) {
    setError(null)
    setOpen(false)
    startTransition(async () => {
      const res = await deferHomework(itemId, newDueDate)
      if (!res.ok) setError(res.error ?? '오류')
    })
  }

  return (
    <div className="relative flex-shrink-0">
      <Menu.Root open={open} onOpenChange={setOpen} modal={false}>
        <Menu.Trigger
          render={(triggerProps) => (
            <button
              type="button"
              {...triggerProps}
              className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              aria-label="미루기"
              title="미루기"
            >
              <CalendarClock className="h-4 w-4" aria-hidden />
            </button>
          )}
        />

        <Menu.Portal>
          <Menu.Positioner align="end" sideOffset={4} side="bottom">
            <Menu.Popup className={POPUP_CLASS}>
              <div className="px-2 py-1 text-xs font-medium text-muted-foreground border-b mb-1">
                미루기
              </div>
              {options.map((opt) => (
                <Menu.Item
                  key={opt.label}
                  disabled={opt.date === currentDueDate}
                  className={cn(ITEM_CLASS, 'justify-between')}
                  onClick={() => doDefer(opt.date)}
                >
                  <span>{opt.label}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">{opt.date.slice(5)}</span>
                </Menu.Item>
              ))}
              <div className="border-t mt-1 px-2 pt-2 pb-1 space-y-1">
                <div className="text-xs text-muted-foreground">직접 선택</div>
                <div className="flex items-center gap-1">
                  <input
                    type="date"
                    value={customDate}
                    min={addDays(today, 1)}
                    onChange={(e) => setCustomDate(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    className="w-full text-xs bg-background border border-input rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                  <button
                    type="button"
                    disabled={!customDate}
                    onClick={() => customDate && doDefer(customDate)}
                    className="text-xs px-2 py-1 rounded bg-foreground text-background hover:bg-foreground/90 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
                  >
                    확인
                  </button>
                </div>
              </div>
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>

      {error && (
        <div className="fixed right-2 top-2 z-50 rounded bg-destructive px-2 py-1 text-xs text-destructive-foreground whitespace-nowrap shadow">
          {error}
        </div>
      )}
    </div>
  )
}
