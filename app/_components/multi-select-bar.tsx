'use client'

import { useState, useTransition, useCallback, createContext, useContext } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Trash2, Undo2, X } from 'lucide-react'
import { bulkToggleItemsDone, bulkDeleteItems } from '@/server/actions/homework'
import { cn } from '@/lib/utils'

// ── Context ──────────────────────────────────────────────────────────────────

type MultiSelectCtx = {
  active: boolean
  selected: Set<number>
  toggle: (id: number) => void
  /** Add many ids to selection at once (used by group "select all" buttons). */
  selectMany: (ids: number[]) => void
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
  activeIds,
  doneIds,
  mode = 'full',
}: {
  children: React.ReactNode
  /** 활성(미완료) 항목 ID들 — "할 일 전체" 버튼이 한 번에 선택. */
  activeIds: number[]
  /** 완료 항목 ID들 — "완료 전체" 버튼이 한 번에 선택. */
  doneIds: number[]
  /**
   * 'delete-only': 일괄 완료/복구 버튼을 숨김. 학원 상세처럼 완료 토글이 정책상
   * 비활성인 화면에서 사용. 기본 'full'은 대시보드용.
   */
  mode?: 'full' | 'delete-only'
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

  const selectMany = useCallback((ids: number[]) => {
    setSelected((prev) => {
      const next = new Set(prev)
      for (const id of ids) next.add(id)
      return next
    })
  }, [])

  const selectAllActive = useCallback(() => {
    setSelected((prev) => {
      const next = new Set(prev)
      for (const id of activeIds) next.add(id)
      return next
    })
  }, [activeIds])

  const selectAllDone = useCallback(() => {
    setSelected((prev) => {
      const next = new Set(prev)
      for (const id of doneIds) next.add(id)
      return next
    })
  }, [doneIds])

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

  const handleUndone = () => {
    if (selected.size === 0) return
    startTransition(async () => {
      await bulkToggleItemsDone(Array.from(selected), false)
      exit()
      router.refresh()
    })
  }

  return (
    <MultiSelectContext.Provider value={{ active, selected, toggle, selectMany, enter, exit }}>
      {children}

      {/* Sticky floating bar — visible only when multi-select is active */}
      {active && (
        <div
          className="fixed bottom-14 left-0 right-0 z-50 bg-background border-t shadow-lg px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between md:bottom-0"
          role="toolbar"
          aria-label="선택 모드 도구 모음"
        >
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-sm font-medium">{selected.size}개 선택됨</span>
            {activeIds.length > 0 && (
              <button
                type="button"
                onClick={selectAllActive}
                className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
              >
                할 일 전체
              </button>
            )}
            {doneIds.length > 0 && (
              <button
                type="button"
                onClick={selectAllDone}
                className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
              >
                완료 전체
              </button>
            )}
            <button
              type="button"
              onClick={clearAll}
              className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
            >
              선택 해제
            </button>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {mode === 'full' && (
              <>
                <button
                  type="button"
                  onClick={handleDone}
                  disabled={selected.size === 0}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm bg-good text-white hover:bg-good/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <Check className="h-3.5 w-3.5" aria-hidden />
                  완료
                </button>
                <button
                  type="button"
                  onClick={handleUndone}
                  disabled={selected.size === 0}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm bg-muted text-foreground hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <Undo2 className="h-3.5 w-3.5" aria-hidden />
                  복구
                </button>
              </>
            )}
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
