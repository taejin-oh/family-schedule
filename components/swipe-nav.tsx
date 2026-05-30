'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { TABS, currentTabIndex } from '@/lib/tabs'
import { track as trackEvent } from '@/lib/log/client'

const SWIPE_THRESHOLD_PX = 60
const SWIPE_VERTICAL_RATIO = 0.6
const SWIPE_MAX_DURATION_MS = 600
const DIRECTION_LOCK_PX = 8
const ANIMATION_MS = 220
const EDGE_RESISTANCE = 0.3
const SNAPSHOT_DELAY_MS = 300
const PAGE_GAP_PX = 16
const LOADING_INDICATOR_DELAY_MS = 300

// Module-level cache. Lives for the lifetime of the page (not across reloads).
const snapshotCache = new Map<string, string>()

function isSwipeBlockedStart(el: Element | null): boolean {
  if (!el) return false
  const tag = el.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (el.closest('[contenteditable="true"]')) return true
  if (el.closest('[role="menu"], [role="dialog"]')) return true
  return false
}

export function SwipeNav({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const trackRef = useRef<HTMLDivElement>(null)
  const currentSlotRef = useRef<HTMLDivElement>(null)
  const startX = useRef(0)
  const startY = useRef(0)
  const startTime = useRef(0)
  const skipRef = useRef(false)
  const directionLockRef = useRef<'none' | 'horizontal' | 'vertical'>('none')
  const lastSwipeDirRef = useRef<'left' | 'right' | null>(null)

  // In-flight swipe state — supports queuing additional swipes during the
  // slide-out animation / router.push pending phase.
  const inFlightDirRef = useRef<'left' | 'right' | null>(null)
  const inFlightTargetIdxRef = useRef<number | null>(null)
  const inFlightTimeoutRef = useRef<number | null>(null)

  const [isPending, startTransition] = useTransition()
  const [showLoading, setShowLoading] = useState(false)
  const isShowingRef = useRef(false)
  const barRef = useRef<HTMLDivElement>(null)

  // Show loading bar only when the navigation hasn't settled within
  // LOADING_INDICATOR_DELAY_MS — prevents flashing on fast (prefetched) routes.
  // On completion, snap to full + fade, then unmount.
  useEffect(() => {
    if (isPending) {
      const id = window.setTimeout(() => {
        isShowingRef.current = true
        setShowLoading(true)
      }, LOADING_INDICATOR_DELAY_MS)
      return () => window.clearTimeout(id)
    }
    if (!isShowingRef.current) return
    isShowingRef.current = false
    const bar = barRef.current
    if (bar) {
      bar.style.transition = 'transform 300ms ease-out, opacity 300ms 200ms ease-out'
      bar.style.transform = 'scaleX(1)'
      bar.style.opacity = '0'
    }
    const id = window.setTimeout(() => setShowLoading(false), 500)
    return () => window.clearTimeout(id)
  }, [isPending])

  // Snap the bar to scaleX(0) and restart the fake-progress growth toward
  // scaleX(0.92). Called both when the bar first appears and when a chained
  // swipe is registered (to communicate "new input recognized").
  function restartProgressBar() {
    const b = barRef.current
    if (!b) return
    b.style.transition = 'none'
    b.style.opacity = '1'
    b.style.transform = 'scaleX(0)'
    // Force reflow so the browser commits the scaleX(0) start state before
    // we set the long transition target — otherwise the transition won't fire.
    void b.offsetWidth
    b.style.transition = 'transform 8s cubic-bezier(0, 0, 0.2, 1)'
    b.style.transform = 'scaleX(0.92)'
  }

  // When the bar appears, kick off the "fake progress" growth: 0 → 92% over
  // 8s with a decelerating curve. It just hovers near the ceiling until the
  // navigation completes (handled in the effect above).
  useEffect(() => {
    if (!showLoading) return
    restartProgressBar()
  }, [showLoading])

  const idx = currentTabIndex(pathname)
  const prevTab = idx > 0 ? TABS[idx - 1] : null
  const nextTab = idx >= 0 && idx < TABS.length - 1 ? TABS[idx + 1] : null
  const prevSnapshot = prevTab ? snapshotCache.get(prevTab.href) : undefined
  const nextSnapshot = nextTab ? snapshotCache.get(nextTab.href) : undefined

  // Pre-warm adjacent RSC payloads.
  useEffect(() => {
    if (idx === -1) return
    if (idx > 0) router.prefetch(TABS[idx - 1].href)
    if (idx < TABS.length - 1) router.prefetch(TABS[idx + 1].href)
  }, [idx, router])

  // Snapshot the current page's rendered DOM shortly after a navigation settles,
  // so that next time someone is on an adjacent tab they see this content during
  // the swipe instead of empty space.
  useEffect(() => {
    if (idx === -1) return
    const id = window.setTimeout(() => {
      const el = currentSlotRef.current
      if (el) snapshotCache.set(pathname, el.innerHTML)
    }, SNAPSHOT_DELAY_MS)
    return () => window.clearTimeout(id)
  }, [pathname, idx])

  // After a swipe-driven navigation, the track was animated to ±100% (slide-out)
  // before router.push. Now snap it back to 0 (the new current page is already
  // in the center slot of the new mount — no slide-in needed because the carousel
  // already brought it into view during the gesture). Also clears any
  // in-flight swipe state.
  useEffect(() => {
    const track = trackRef.current
    if (!track) return
    lastSwipeDirRef.current = null
    inFlightDirRef.current = null
    inFlightTargetIdxRef.current = null
    if (inFlightTimeoutRef.current !== null) {
      window.clearTimeout(inFlightTimeoutRef.current)
      inFlightTimeoutRef.current = null
    }
    track.style.transition = ''
    track.style.transform = ''
  }, [pathname])

  function onTouchStart(e: React.TouchEvent) {
    // Always reset direction lock on every touchstart — defensive against
    // stuck state if a previous touchend was missed (e.g. touchcancel).
    directionLockRef.current = 'none'

    if (e.touches.length !== 1) {
      skipRef.current = true
      return
    }
    if (isSwipeBlockedStart(e.target as Element)) {
      skipRef.current = true
      return
    }
    skipRef.current = false
    startX.current = e.touches[0].clientX
    startY.current = e.touches[0].clientY
    startTime.current = Date.now()
  }

  function onTouchCancel() {
    // Touch was interrupted — clean up state so the next swipe works.
    skipRef.current = false
    directionLockRef.current = 'none'
  }

  function onTouchMove(e: React.TouchEvent) {
    if (skipRef.current) return
    if (e.touches.length !== 1) return

    const t = e.touches[0]
    const dx = t.clientX - startX.current
    const dy = t.clientY - startY.current

    if (directionLockRef.current === 'none') {
      if (Math.abs(dx) < DIRECTION_LOCK_PX && Math.abs(dy) < DIRECTION_LOCK_PX) return
      if (Math.abs(dx) > Math.abs(dy)) {
        directionLockRef.current = 'horizontal'
      } else {
        directionLockRef.current = 'vertical'
        skipRef.current = true
        return
      }
    }

    if (directionLockRef.current !== 'horizontal') return
    if (idx === -1) return

    // If a slide-out animation is already in flight, don't override its
    // transform with finger-tracked drag — the next swipe just queues a
    // target advance (handled in onTouchEnd).
    if (inFlightDirRef.current !== null) return

    let translation = dx
    if (idx === 0 && dx > 0) translation = dx * EDGE_RESISTANCE
    if (idx === TABS.length - 1 && dx < 0) translation = dx * EDGE_RESISTANCE

    const track = trackRef.current
    if (track) {
      track.style.transition = 'none'
      track.style.transform = `translateX(${translation}px)`
    }
  }

  function onTouchEnd(e: React.TouchEvent) {
    const track = trackRef.current
    if (!track) return

    const wasHorizontal = directionLockRef.current === 'horizontal'
    directionLockRef.current = 'none'

    if (skipRef.current) {
      skipRef.current = false
      // Don't override an in-flight slide-out animation with snap-back.
      if (track.style.transform && inFlightDirRef.current === null) {
        track.style.transition = `transform ${ANIMATION_MS}ms ease-out`
        track.style.transform = 'translateX(0)'
      }
      return
    }

    if (!wasHorizontal) return
    if (e.changedTouches.length === 0) return

    // 매칭 없는 page에서는 스와이프 무효 (전엔 idx=-1 → proposedTarget=0(홈)으로 떨어졌음).
    if (idx === -1) return

    const t = e.changedTouches[0]
    const dx = t.clientX - startX.current
    const dy = t.clientY - startY.current
    const dt = Date.now() - startTime.current

    const passedThreshold =
      Math.abs(dx) >= SWIPE_THRESHOLD_PX &&
      Math.abs(dy) <= Math.abs(dx) * SWIPE_VERTICAL_RATIO &&
      dt < SWIPE_MAX_DURATION_MS

    // When another swipe is already in flight in the same direction, chain
    // from the pending target; otherwise from current idx.
    const baseIdx =
      inFlightDirRef.current !== null && inFlightTargetIdxRef.current !== null
        ? inFlightTargetIdxRef.current
        : idx

    if (!passedThreshold) {
      // Snap back only if no slide-out is in flight.
      if (inFlightDirRef.current === null) {
        track.style.transition = `transform ${ANIMATION_MS}ms ease-out`
        track.style.transform = 'translateX(0)'
      }
      return
    }

    const direction: 'left' | 'right' = dx < 0 ? 'left' : 'right'

    // Opposite-direction swipe during in-flight — ignore (would be confusing).
    if (inFlightDirRef.current !== null && inFlightDirRef.current !== direction) return

    const proposedTarget = direction === 'left'
      ? Math.min(baseIdx + 1, TABS.length - 1)
      : Math.max(baseIdx - 1, 0)

    if (proposedTarget === baseIdx) {
      // Already at the last/first tab in that direction.
      if (inFlightDirRef.current === null) {
        track.style.transition = `transform ${ANIMATION_MS}ms ease-out`
        track.style.transform = 'translateX(0)'
      }
      return
    }

    // Three phases:
    //   A) No swipe in flight  — full slide-out animation + scheduled router.push
    //   B) Slide animating (timeout still pending) — just bump the target; the
    //      pending timeout will use the latest target when it fires.
    //   C) Timeout already fired (router.push in flight, RSC pending) — chain
    //      a new router.push immediately. React supersedes the in-flight one.
    trackEvent('interaction', 'swipe_nav', {
      direction,
      from: TABS[idx]?.href,
      to: TABS[proposedTarget]?.href,
      chained: inFlightDirRef.current !== null,
    })

    if (inFlightDirRef.current === null) {
      // Phase A
      const cur = currentSlotRef.current
      if (cur) snapshotCache.set(pathname, cur.innerHTML)

      track.style.transition = `transform ${ANIMATION_MS}ms ease-out`
      track.style.transform = direction === 'left'
        ? `translateX(calc(-100% - ${PAGE_GAP_PX}px))`
        : `translateX(calc(100% + ${PAGE_GAP_PX}px))`

      inFlightTimeoutRef.current = window.setTimeout(() => {
        const target = inFlightTargetIdxRef.current
        inFlightTimeoutRef.current = null
        if (target === null) return
        startTransition(() => {
          router.push(TABS[target].href)
        })
      }, ANIMATION_MS)
    } else {
      // Phase B or C — chained swipe. Reset the loading bar so the user can
      // see that their additional input was recognized (bar snaps to 0 and
      // grows again).
      restartProgressBar()
      if (inFlightTimeoutRef.current === null) {
        // Phase C — fire chained navigation immediately to the further
        // target. React supersedes the in-flight router.push.
        startTransition(() => {
          router.push(TABS[proposedTarget].href)
        })
      }
      // Phase B falls through: just update the refs below.
    }

    inFlightDirRef.current = direction
    inFlightTargetIdxRef.current = proposedTarget
    lastSwipeDirRef.current = direction
  }

  return (
    <>
      {showLoading && (
        <div
          className="fixed left-0 right-0 z-[60] h-1 bg-primary/10 overflow-hidden pointer-events-none"
          style={{ top: 'env(safe-area-inset-top)' }}
          aria-hidden
        >
          <div
            ref={barRef}
            className="absolute inset-0 bg-primary will-change-transform"
            style={{ transformOrigin: 'left center', transform: 'scaleX(0)' }}
          />
        </div>
      )}
      <div
        className="flex-1 relative overflow-x-clip"
        style={{ touchAction: 'pan-y' }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchCancel}
      >
      <div ref={trackRef} className="relative will-change-transform">
        {prevSnapshot && (
          <div
            className="absolute inset-0 pointer-events-none overflow-clip"
            style={{ transform: `translateX(calc(-100% - ${PAGE_GAP_PX}px))` }}
            aria-hidden
            dangerouslySetInnerHTML={{ __html: prevSnapshot }}
          />
        )}

        <div ref={currentSlotRef}>
          {children}
        </div>

        {nextSnapshot && (
          <div
            className="absolute inset-0 pointer-events-none overflow-clip"
            style={{ transform: `translateX(calc(100% + ${PAGE_GAP_PX}px))` }}
            aria-hidden
            dangerouslySetInnerHTML={{ __html: nextSnapshot }}
          />
        )}
      </div>
      </div>
    </>
  )
}
