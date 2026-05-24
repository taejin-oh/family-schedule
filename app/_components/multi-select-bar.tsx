'use client'

import { useState, useTransition, useCallback, createContext, useContext } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Trash2, X } from 'lucide-react'
import { bulkToggleItemsDone, bulkDeleteItems } from '@/server/actions/homework'
import { cn } from '@/lib/utils'

// ── Context ──────────────────────────────────────────────────────────────────

type MultiSelectCtx = {
  active: boolean
  selected: Set<number>
  toggle: (id: number) => void
  enter: () => void
  exit: () => void
}

export const MultiSelectContext = createContext<MultiSelectCtx | null>(null)

export function useMultiSelect() {
  return useContext(MultiSelectContext)
}

// ── Provider ─────────────────────────────────────────────────────────────────

/**
 * Provides multi-select state to descendants and renders the sticky floating
 * action bar when multi-select mode is active.
 *
 * Place <MultiSelectToggle /> anywhere inside to render the toggle button.
 */
export function MultiSelectProvider({
  children,
  selectableIds,
}: {
  children: React.ReactNode
  selectableIds: number[]
}) {
  const router = useRouter()
  const [active, setActive] = useState(false)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [, startTransition] = useTransition()

  const enter = useCallback(() => {
    setActive(true)
    setSelected(new Set())
  }, [])

  const exit = useCallback(() => {
    setActive(false)
    setSelected(new Set())
  }, [])

  const toggle = useCallback((id: number) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const selectAll = useCallback(() => {
    setSelected(new Set(selectableIds))
  }, [selectableIds])

  const clearAll = useCallback(() => {
    setSelected(new Set())
  }, [])

  const handleDone = () => {
    if (selected.size === 0) return
    startTransition(async () => {
      await bulkToggleItemsDone(Array.from(selected), true)
      exit()
      router.refresh()
    })
  }

  const handleDelete = () => {
    if (selected.size === 0) return
    if (!window.confirm(`선택한 ${selected.size}개 항목을 삭제할까요?`)) return
    startTransition(async () => {
      await bulkDeleteItems(Array.from(selected))
      exit()
      router.refresh()
    })
  }

  return (
    <MultiSelectContext.Provider value={{ active, selected, toggle, enter, exit }}>
      {children}

      {/* Sticky floating bar — visible only when multi-select is active */}
      {active && (
        <div
          className="fixed bottom-0 left-0 right-0 z-50 bg-background border-t shadow-lg px-4 py-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
          role="toolbar"
          aria-label="선택 모드 도구 모음"
        >
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-sm font-medium">{selected.size}개 선택됨</span>
            <button
              type="button"
              onClick={selectAll}
              className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
            >
              전체 선택
            </button>
            <button
              type="button"
              onClick={clearAll}
              className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
            >
              선택 해제
            </button>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={handleDone}
              disabled={selected.size === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm bg-green-600 text-white hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <Check className="h-3.5 w-3.5" aria-hidden />
              완료로 표시
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={selected.size === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
              삭제
            </button>
            <button
              type="button"
              onClick={exit}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm border hover:bg-accent transition-colors"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
              취소
            </button>
          </div>
        </div>
      )}
      {/* Bottom padding to prevent content being hidden behind the fixed bar */}
      {active && <div className="h-24 sm:h-16 shrink-0" aria-hidden />}
    </MultiSelectContext.Provider>
  )
}

// ── Toggle button ─────────────────────────────────────────────────────────────

/**
 * Renders the "선택" mode toggle chip.
 * Must be placed inside <MultiSelectProvider>.
 */
export function MultiSelectToggle() {
  const ctx = useMultiSelect()
  if (!ctx) return null
  return (
    <button
      type="button"
      onClick={ctx.active ? ctx.exit : ctx.enter}
      className={cn(
        'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm transition-colors border',
        ctx.active
          ? 'bg-foreground text-background border-foreground'
          : 'bg-card text-muted-foreground border-foreground/10 hover:bg-accent hover:text-foreground'
      )}
      aria-pressed={ctx.active}
    >
      <Check className="h-3.5 w-3.5" aria-hidden />
      선택
    </button>
  )
}
