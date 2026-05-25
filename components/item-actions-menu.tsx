'use client'

import { useState, useTransition } from 'react'
import { MoreVertical } from 'lucide-react'
import { Menu } from '@base-ui/react/menu'
import { useLongPress } from '@/lib/use-long-press'
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
function nextSaturday(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  const dow = d.getDay()
  d.setDate(d.getDate() + (dow === 6 ? 7 : 6 - dow))
  return localDateIsoClient(d)
}
function nextMonday(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  const dow = d.getDay()
  d.setDate(d.getDate() + (dow === 1 ? 7 : ((1 - dow + 7) % 7 || 7)))
  return localDateIsoClient(d)
}

export type ItemKind = 'homework' | 'recurring'

type HomeworkProps = {
  itemKind: 'homework'
  currentDueDate?: string | null
  onDefer: (newDate: string) => Promise<void>
  onDelete: () => Promise<void>
}
type RecurringProps = {
  itemKind: 'recurring'
  onArchive: () => Promise<void>
}
type CommonProps = {
  children: React.ReactNode
  onEdit: () => void
}
type Props = CommonProps & (HomeworkProps | RecurringProps)

const POPUP_CLASS = cn(
  'z-50 min-w-[11rem] rounded-md border bg-popover shadow-md py-1 text-sm text-popover-foreground outline-none',
  'data-[starting-style]:opacity-0 data-[ending-style]:opacity-0 transition-opacity duration-100',
)
const ITEM_CLASS = cn(
  'relative flex cursor-default select-none items-center gap-2 px-3 py-2 outline-none w-full text-left',
  'focus:bg-accent focus:text-accent-foreground hover:bg-accent hover:text-accent-foreground',
  'data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
)

export function ItemActionsMenu(props: Props) {
  const { children, onEdit } = props
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [customDate, setCustomDate] = useState('')
  const [, startTransition] = useTransition()

  const longPress = useLongPress(() => setOpen(true))
  const today = localDateIsoClient()
  const deferOptions = [
    { label: '내일', date: addDays(today, 1) },
    { label: '모레', date: addDays(today, 2) },
    { label: '이번 주말 (토)', date: nextSaturday(today) },
    { label: '다음 주 월요일', date: nextMonday(today) },
  ]

  function runAction(p: () => Promise<void>, failMsg: string) {
    setOpen(false)
    startTransition(async () => {
      try { await p() }
      catch { setError(failMsg) }
    })
  }

  return (
    <div className="relative group/row" {...longPress}>
      {children}

      <Menu.Root open={open} onOpenChange={setOpen} modal={false}>
        <Menu.Trigger
          render={(triggerProps) => (
            <button
              type="button"
              {...triggerProps}
              onClick={(e) => { e.stopPropagation(); triggerProps.onClick?.(e) }}
              className={cn(
                'absolute right-2 top-1/2 -translate-y-1/2',
                'h-7 w-7 rounded',
                'flex items-center justify-center',
                'text-muted-foreground hover:text-foreground hover:bg-accent transition-colors',
                'opacity-0 group-hover/row:opacity-100 focus:opacity-100 data-[popup-open]:opacity-100',
                '[@media(pointer:coarse)]:hidden',
              )}
              aria-label="액션 메뉴"
            >
              <MoreVertical className="h-4 w-4" />
            </button>
          )}
        />

        <Menu.Portal>
          <Menu.Positioner align="end" sideOffset={4} side="bottom">
            <Menu.Popup className={POPUP_CLASS}>
              <Menu.Item className={ITEM_CLASS} onClick={() => { setOpen(false); onEdit() }}>
                수정
              </Menu.Item>

              {props.itemKind === 'homework' && (
                <Menu.SubmenuRoot>
                  <Menu.SubmenuTrigger className={cn(ITEM_CLASS, 'justify-between')}>
                    <span>미루기</span>
                    <span className="text-muted-foreground">›</span>
                  </Menu.SubmenuTrigger>
                  <Menu.Portal>
                    <Menu.Positioner align="start" sideOffset={4} side="right">
                      <Menu.Popup className={POPUP_CLASS}>
                        {deferOptions.map((opt) => (
                          <Menu.Item
                            key={opt.label}
                            disabled={opt.date === props.currentDueDate}
                            className={cn(ITEM_CLASS, 'justify-between gap-3')}
                            onClick={() => runAction(() => props.onDefer(opt.date), '미루기 실패')}
                          >
                            <span>{opt.label}</span>
                            <span className="text-xs text-muted-foreground tabular-nums">{opt.date.slice(5)}</span>
                          </Menu.Item>
                        ))}
                        <div className="border-t my-1" />
                        <div className="px-2 py-1.5 space-y-1">
                          <div className="text-xs text-muted-foreground">직접 선택</div>
                          <div className="flex items-center gap-1">
                            <input
                              type="date"
                              value={customDate}
                              min={addDays(today, 1)}
                              onChange={(e) => setCustomDate(e.target.value)}
                              className="w-full text-xs bg-background border border-input rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-ring"
                              onClick={(e) => e.stopPropagation()}
                            />
                            <button
                              type="button"
                              disabled={!customDate}
                              onClick={() => customDate && runAction(() => props.onDefer(customDate), '미루기 실패')}
                              className="text-xs px-2 py-1 rounded bg-foreground text-background hover:bg-foreground/90 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
                            >
                              확인
                            </button>
                          </div>
                        </div>
                      </Menu.Popup>
                    </Menu.Positioner>
                  </Menu.Portal>
                </Menu.SubmenuRoot>
              )}

              <div className="my-1 h-px bg-border" />

              {props.itemKind === 'homework' && (
                <Menu.Item
                  className={cn(ITEM_CLASS, 'text-destructive hover:bg-destructive/10 focus:bg-destructive/10')}
                  onClick={() => runAction(() => props.onDelete(), '삭제 실패')}
                >
                  삭제
                </Menu.Item>
              )}

              {props.itemKind === 'recurring' && (
                <Menu.Item
                  className={cn(ITEM_CLASS, 'text-muted-foreground')}
                  onClick={() => runAction(() => props.onArchive(), '보관 실패')}
                >
                  보관
                </Menu.Item>
              )}
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>

      {error && (
        <div className="absolute right-2 -bottom-1 z-50 rounded bg-destructive px-2 py-1 text-xs text-destructive-foreground shadow whitespace-nowrap">
          {error}
        </div>
      )}
    </div>
  )
}
