'use client'

import { useState, useTransition } from 'react'
import { MoreVertical } from 'lucide-react'
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

type MenuState = 'closed' | 'main' | 'defer'

export function ItemActionsMenu(props: Props) {
  const { children, onEdit } = props
  const [menuState, setMenuState] = useState<MenuState>('closed')
  const [deferCustom, setDeferCustom] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  const longPress = useLongPress(() => setMenuState('main'))
  const today = localDateIsoClient()
  const deferOptions = [
    { label: '내일', date: addDays(today, 1) },
    { label: '모레', date: addDays(today, 2) },
    { label: '이번 주말 (토)', date: nextSaturday(today) },
    { label: '다음 주 월요일', date: nextMonday(today) },
  ]

  function closeMenu() {
    setMenuState('closed')
    setDeferCustom('')
    setError(null)
  }

  function handleDefer(date: string) {
    if (props.itemKind !== 'homework') return
    closeMenu()
    startTransition(async () => {
      try { await props.onDefer(date) }
      catch { setError('미루기 실패') }
    })
  }

  function handleDelete() {
    if (props.itemKind !== 'homework') return
    closeMenu()
    startTransition(async () => {
      try { await props.onDelete() }
      catch { setError('삭제 실패') }
    })
  }

  function handleArchive() {
    if (props.itemKind !== 'recurring') return
    closeMenu()
    startTransition(async () => {
      try { await props.onArchive() }
      catch { setError('보관 실패') }
    })
  }

  return (
    <div className="relative group/row" {...longPress}>
      {children}

      {/* ⋮ button — only shown on hover-capable (desktop) environments */}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setMenuState((s) => s === 'closed' ? 'main' : 'closed') }}
        className={cn(
          'absolute right-2 top-1/2 -translate-y-1/2',
          'h-7 w-7 rounded',
          'flex items-center justify-center',
          'text-muted-foreground hover:text-foreground hover:bg-accent transition-colors',
          'opacity-0 group-hover/row:opacity-100 focus:opacity-100',
          // Hidden on touch/coarse pointer devices; shown only on hover-capable (desktop)
          '[@media(pointer:coarse)]:hidden',
        )}
        aria-label="액션 메뉴"
      >
        <MoreVertical className="h-4 w-4" />
      </button>

      {/* Backdrop */}
      {menuState !== 'closed' && (
        <div
          className="fixed inset-0 z-40"
          onClick={closeMenu}
          aria-hidden
        />
      )}

      {/* Main menu */}
      {menuState === 'main' && (
        <div
          className="absolute right-2 bottom-1 z-50 min-w-[10rem] rounded-md border bg-popover py-1 text-sm text-popover-foreground shadow-lg"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => { closeMenu(); onEdit() }}
            className="w-full text-left px-3 py-2 hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            수정
          </button>
          {props.itemKind === 'homework' && (
            <button
              type="button"
              onClick={() => setMenuState('defer')}
              className="w-full text-left px-3 py-2 hover:bg-accent hover:text-accent-foreground transition-colors"
            >
              미루기
            </button>
          )}
          <div className="my-1 h-px bg-border" />
          {props.itemKind === 'homework' && (
            <button
              type="button"
              onClick={handleDelete}
              className="w-full text-left px-3 py-2 text-destructive hover:bg-destructive/10 transition-colors"
            >
              삭제
            </button>
          )}
          {props.itemKind === 'recurring' && (
            <button
              type="button"
              onClick={handleArchive}
              className="w-full text-left px-3 py-2 text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
            >
              보관
            </button>
          )}
        </div>
      )}

      {/* Defer sub-menu */}
      {menuState === 'defer' && props.itemKind === 'homework' && (
        <div
          className="absolute right-2 bottom-1 z-50 min-w-[12rem] rounded-md border bg-popover py-1 text-sm text-popover-foreground shadow-lg"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-muted-foreground border-b mb-1">
            <button
              type="button"
              onClick={() => setMenuState('main')}
              className="mr-1 hover:text-foreground"
              aria-label="뒤로"
            >
              ‹
            </button>
            미루기
          </div>
          {deferOptions.map((opt) => (
            <button
              key={opt.label}
              type="button"
              disabled={opt.date === props.currentDueDate}
              onClick={() => handleDefer(opt.date)}
              className={cn(
                'w-full text-left px-3 py-1.5 hover:bg-accent transition-colors flex justify-between gap-3',
                opt.date === props.currentDueDate && 'opacity-40 cursor-not-allowed',
              )}
            >
              <span>{opt.label}</span>
              <span className="text-xs text-muted-foreground tabular-nums">{opt.date.slice(5)}</span>
            </button>
          ))}
          <div className="border-t mt-1 px-2 pt-2 pb-1.5 space-y-1">
            <div className="text-xs text-muted-foreground">직접 선택</div>
            <div className="flex items-center gap-1">
              <input
                type="date"
                value={deferCustom}
                min={addDays(today, 1)}
                onChange={(e) => setDeferCustom(e.target.value)}
                className="w-full text-xs bg-background border border-input rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <button
                type="button"
                disabled={!deferCustom}
                onClick={() => deferCustom && handleDefer(deferCustom)}
                className="text-xs px-2 py-1 rounded bg-foreground text-background hover:bg-foreground/90 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="absolute right-2 bottom-0 z-50 rounded bg-destructive px-2 py-1 text-xs text-destructive-foreground shadow whitespace-nowrap">
          {error}
        </div>
      )}
    </div>
  )
}
