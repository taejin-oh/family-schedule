'use client'

import { useRef, useCallback } from 'react'

export function useLongPress(
  onLongPress: () => void,
  opts?: { ms?: number },
): {
  onTouchStart: (e: React.TouchEvent) => void
  onTouchEnd: () => void
  onTouchCancel: () => void
  onTouchMove: (e: React.TouchEvent) => void
  onMouseDown: (e: React.MouseEvent) => void
  onMouseUp: () => void
  onMouseLeave: () => void
} {
  const ms = opts?.ms ?? 500
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const startPos = useRef<{ x: number; y: number } | null>(null)
  const fired = useRef(false)

  function clear() {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }

  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      fired.current = false
      const t = e.touches[0]
      startPos.current = { x: t.clientX, y: t.clientY }
      clear()
      timerRef.current = setTimeout(() => {
        fired.current = true
        onLongPress()
      }, ms)
    },
    [ms, onLongPress],
  )

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (!startPos.current) return
    const t = e.touches[0]
    const dx = t.clientX - startPos.current.x
    const dy = t.clientY - startPos.current.y
    if (Math.sqrt(dx * dx + dy * dy) > 10) clear()
  }, [])

  const onTouchEnd = useCallback(() => {
    clear()
  }, [])

  const onTouchCancel = useCallback(() => {
    clear()
  }, [])

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return
      fired.current = false
      clear()
      timerRef.current = setTimeout(() => {
        fired.current = true
        onLongPress()
      }, ms)
    },
    [ms, onLongPress],
  )

  const onMouseUp = useCallback(() => {
    clear()
  }, [])

  const onMouseLeave = useCallback(() => {
    clear()
  }, [])

  return { onTouchStart, onTouchEnd, onTouchCancel, onTouchMove, onMouseDown, onMouseUp, onMouseLeave }
}
