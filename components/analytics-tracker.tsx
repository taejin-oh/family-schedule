'use client'

import { usePathname } from 'next/navigation'
import { useEffect, useRef } from 'react'
import { track } from '@/lib/log/client'

/**
 * 모든 페이지 진입/이탈을 자동 로깅. layout.tsx의 client wrapper.
 * - page_enter: pathname 변경 또는 첫 마운트 시
 * - page_leave: 다음 진입 직전 + 탭 unload(pagehide)
 *   props: { path, dwell_ms, ref }
 */
export function AnalyticsTracker() {
  const pathname = usePathname()
  const prevPath = useRef<string | null>(null)
  // eslint-disable-next-line react-hooks/purity -- 첫 mount 시각, 컴포넌트 lifetime 동안 의미 있는 reference 시점
  const enteredAt = useRef<number>(Date.now())

  useEffect(() => {
    const now = Date.now()
    if (prevPath.current !== null && prevPath.current !== pathname) {
      track('navigation', 'page_leave', {
        path: prevPath.current,
        dwell_ms: now - enteredAt.current,
      })
    }
    track('navigation', 'page_enter', {
      ref: prevPath.current,
    })
    prevPath.current = pathname
    enteredAt.current = now
  }, [pathname])

  useEffect(() => {
    const handler = () => {
      if (!prevPath.current) return
      track('navigation', 'page_leave', {
        path: prevPath.current,
        dwell_ms: Date.now() - enteredAt.current,
        reason: 'unload',
      })
    }
    window.addEventListener('pagehide', handler)
    return () => window.removeEventListener('pagehide', handler)
  }, [])

  return null
}
