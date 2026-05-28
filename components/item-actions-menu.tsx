'use client'

import { useEffect, useId, useRef, useState, useTransition } from 'react'
import { MoreVertical } from 'lucide-react'
import { Menu } from '@base-ui/react/menu'
import { useLongPress } from '@/lib/use-long-press'
import { shouldIgnoreTransientLongPressClose } from '@/lib/menu-close-policy'
import { cn } from '@/lib/utils'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { MiniCalendar } from '@/components/mini-calendar'

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

export type ItemKind = 'homework' | 'recurring' | 'academy'

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
type AcademyProps = {
  itemKind: 'academy'
  onArchive: () => Promise<void>
}
type CommonProps = {
  children: React.ReactNode
  onEdit: () => void
}
type Props = CommonProps & (HomeworkProps | RecurringProps | AcademyProps)

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
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerDate, setPickerDate] = useState<string | null>(null)
  const [, startTransition] = useTransition()
  const ignoreTransientCloseRef = useRef(false)

  const instanceId = useId()

  // Close any other open ItemActionsMenu when this one opens (mobile long-press
  // doesn't reliably trigger base-ui's outside-press dismiss).
  useEffect(() => {
    function handler(e: Event) {
      const ce = e as CustomEvent<string>
      if (ce.detail !== instanceId) setOpen(false)
    }
    window.addEventListener('iam:close-others', handler)
    return () => window.removeEventListener('iam:close-others', handler)
  }, [instanceId])

  function armTransientCloseGuard() {
    ignoreTransientCloseRef.current = true
    const controller = new AbortController()
    window.setTimeout(() => {
      ignoreTransientCloseRef.current = false
      controller.abort()
    }, 1000)
    const release = () => {
      window.setTimeout(() => {
        ignoreTransientCloseRef.current = false
        controller.abort()
      }, 0)
    }
    window.addEventListener('mouseup', release, { capture: true, once: true, signal: controller.signal })
    window.addEventListener('touchend', release, { capture: true, once: true, signal: controller.signal })
    window.addEventListener('touchcancel', release, { capture: true, once: true, signal: controller.signal })
  }

  const { consumeLongPress, ...longPress } = useLongPress(() => {
    window.dispatchEvent(new CustomEvent('iam:close-others', { detail: instanceId }))
    armTransientCloseGuard()
    setOpen(true)
  })
  const today = localDateIsoClient()
  const deferOptions = [
    { label: '내일', date: addDays(today, 1) },
    { label: '모레', date: addDays(today, 2) },
    { label: '이번 주말 (토)', date: nextSaturday(today) },
    { label: '다음 주 월요일', date: nextMonday(today) },
  ]

  function runAction(p: () => Promise<void>, failMsg: string) {
    setOpen(false)
    setError(null)
    startTransition(async () => {
      try {
        await p()
      } catch {
        setError(failMsg)
        // auto-dismiss after 4s so a single failed action doesn't block the row forever
        setTimeout(() => setError(null), 4000)
      }
    })
  }

  return (
    <div
      className="relative group/row"
      {...longPress}
      onClickCapture={(e) => {
        // Suppress the click that follows a fired long-press so card-level
        // form submits (e.g. KidsTodoCard) don't trigger right after the menu opens.
        if (consumeLongPress()) {
          e.stopPropagation()
          e.preventDefault()
        }
      }}
    >
      {children}

      <Menu.Root
        open={open}
        onOpenChange={(nextOpen, eventDetails) => {
          if (
            shouldIgnoreTransientLongPressClose({
              nextOpen,
              openedByLongPress: ignoreTransientCloseRef.current,
              reason: eventDetails.reason,
            })
          ) {
            return
          }
          if (!nextOpen) ignoreTransientCloseRef.current = false
          setOpen(nextOpen)
        }}
        modal={true}
      >
        <Menu.Trigger
          render={(triggerProps) => (
            <button
              type="button"
              {...triggerProps}
              onClick={(e) => { e.stopPropagation(); triggerProps.onClick?.(e) }}
              className={cn(
                'absolute right-2 top-1/2 -translate-y-1/2',
                'h-8 w-8 rounded',
                'flex items-center justify-center',
                'text-muted-foreground hover:text-foreground hover:bg-accent transition-colors',
                // Desktop: hover-only to keep rows uncluttered.
                'opacity-0 group-hover/row:opacity-100 focus:opacity-100 data-[popup-open]:opacity-100',
                // Mobile (touch): always visible — long-press also works.
                '[@media(pointer:coarse)]:opacity-100',
              )}
              aria-label="액션 메뉴"
            >
              <MoreVertical className="h-4 w-4" />
            </button>
          )}
        />

        <Menu.Portal>
          <Menu.Positioner align="start" sideOffset={4} side="left">
            <Menu.Popup className={POPUP_CLASS}>
              <Menu.Item className={ITEM_CLASS} onClick={() => { setOpen(false); onEdit() }}>
                수정
              </Menu.Item>

              {props.itemKind === 'homework' && (
                <Menu.SubmenuRoot>
                  <Menu.SubmenuTrigger className={cn(ITEM_CLASS, 'justify-between')} closeDelay={150}>
                    <span>미루기</span>
                    <span className="text-muted-foreground">›</span>
                  </Menu.SubmenuTrigger>
                  <Menu.Portal>
                    <Menu.Positioner align="start" sideOffset={0} side="right">
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
                        <Menu.Item
                          className={cn(ITEM_CLASS, 'justify-between gap-3')}
                          onClick={() => {
                            // 메뉴 닫고 sheet 열기. 두 modal 동시 띄우면 backdrop 충돌.
                            setOpen(false)
                            const initial = props.itemKind === 'homework' ? props.currentDueDate ?? null : null
                            setPickerDate(initial)
                            // 메뉴 닫힘 트랜지션 후 sheet 오픈
                            setTimeout(() => setPickerOpen(true), 100)
                          }}
                        >
                          <span>직접 선택…</span>
                          <span className="text-muted-foreground">›</span>
                        </Menu.Item>
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

              {(props.itemKind === 'recurring' || props.itemKind === 'academy') && (
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

      {props.itemKind === 'homework' && (
        <Sheet open={pickerOpen} onOpenChange={(o) => !o && setPickerOpen(false)}>
          <SheetContent>
            <SheetHeader>
              <SheetTitle>날짜 선택</SheetTitle>
            </SheetHeader>
            <div className="mt-2">
              <MiniCalendar
                selected={pickerDate}
                onSelect={setPickerDate}
                todayIso={today}
                minIso={addDays(today, 1)}
              />
            </div>
            <div className="flex gap-2 pt-4">
              <Button variant="outline" className="flex-1" onClick={() => setPickerOpen(false)}>
                취소
              </Button>
              <Button
                className="flex-1"
                disabled={!pickerDate || pickerDate < addDays(today, 1)}
                onClick={() => {
                  if (!pickerDate) return
                  setPickerOpen(false)
                  runAction(() => props.onDefer(pickerDate), '미루기 실패')
                }}
              >
                이 날짜로 미루기
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      )}
    </div>
  )
}
