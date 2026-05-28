'use client'

import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { Check } from 'lucide-react'

export type ToastAction = {
  /** Toast message — usually "X가 삭제됨" / "X 보관됨" */
  label: string
  /** Called when user taps [취소]. For archive: re-call archive's restore action.
   *  For delete: usually just unhide the card (no server call yet). */
  onUndo?: () => void | Promise<void>
  /** Called when toast auto-dismisses or is replaced (or page unloads).
   *  For delete: actually run the server delete here. For archive: no-op. */
  onCommit?: () => void | Promise<void>
  /** Auto-dismiss duration in ms (default 7000). */
  durationMs?: number
}

type Ctx = {
  show: (action: ToastAction) => void
}

const ToastContext = createContext<Ctx | null>(null)

export function useToast(): Ctx {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>')
  return ctx
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [current, setCurrent] = useState<ToastAction | null>(null)
  const currentRef = useRef<ToastAction | null>(null)
  const timerRef = useRef<number | null>(null)
  const pathname = usePathname()
  const prevPathnameRef = useRef(pathname)

  function clearTimer() {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }

  function dismiss(kind: 'undo' | 'commit') {
    const c = currentRef.current
    if (!c) return
    clearTimer()
    currentRef.current = null
    setCurrent(null)
    if (kind === 'undo' && c.onUndo) void c.onUndo()
    if (kind === 'commit' && c.onCommit) void c.onCommit()
  }

  function show(action: ToastAction) {
    // Replace any existing toast — first commit the old one (since user moved on).
    if (currentRef.current) {
      const old = currentRef.current
      clearTimer()
      if (old.onCommit) void old.onCommit()
    }
    currentRef.current = action
    setCurrent(action)
    const duration = action.durationMs ?? 7000
    timerRef.current = window.setTimeout(() => dismiss('commit'), duration)
  }

  // Commit pending toast on page navigation (Next.js App Router doesn't have
  // a built-in route-change event, so we watch usePathname).
  useEffect(() => {
    if (pathname === prevPathnameRef.current) return
    prevPathnameRef.current = pathname
    const c = currentRef.current
    if (!c) return
    clearTimer()
    currentRef.current = null
    // Defer setCurrent so we don't violate the setState-in-effect lint rule.
    window.setTimeout(() => setCurrent(null), 0)
    if (c.onCommit) void c.onCommit()
  }, [pathname])

  // Commit pending toast on hard navigation / tab close.
  useEffect(() => {
    function handler() {
      const c = currentRef.current
      if (c && c.onCommit) void c.onCommit()
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [])

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      {current && (
        <div
          className="fixed left-1/2 -translate-x-1/2 z-[55] bottom-16 md:bottom-6 pointer-events-none"
          style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
          role="status"
          aria-live="polite"
        >
          <div className="pointer-events-auto bg-foreground text-background rounded-full pl-4 pr-2 py-2 shadow-lg flex items-center gap-3 max-w-[90vw]">
            <Check className="h-4 w-4 shrink-0" strokeWidth={3} aria-hidden />
            <span className="text-sm font-medium truncate">{current.label}</span>
            {current.onUndo && (
              <button
                type="button"
                onClick={() => dismiss('undo')}
                className="text-sm font-semibold px-3 py-1 rounded-full hover:bg-background/15 active:bg-background/25 transition-colors shrink-0"
              >
                취소
              </button>
            )}
          </div>
        </div>
      )}
    </ToastContext.Provider>
  )
}
