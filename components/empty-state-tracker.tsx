'use client'

import { useEffect } from 'react'
import { track } from '@/lib/log/client'

/**
 * Server component에서 empty state JSX 위에 mount해서 노출 시점을 자동 추적.
 * which: 표시된 카피 식별자 (제목 앞 12자 정도, 메타데이터만).
 */
export function EmptyStateTracker({ where, which }: { where: string; which?: string }) {
  useEffect(() => {
    track('feature', 'empty_state.seen', { where, which })
  }, [where, which])
  return null
}
