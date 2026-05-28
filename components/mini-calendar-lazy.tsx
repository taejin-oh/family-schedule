'use client'

import dynamic from 'next/dynamic'

/**
 * MiniCalendar는 ItemActionsMenu의 "직접 선택…" Sheet 안에서만 쓰는데,
 * 모든 row마다 ItemActionsMenu가 mount → MiniCalendar component instance도 다수 mount.
 * 첫 picker open 시까지 chunk 로드 안 함.
 */
export const MiniCalendar = dynamic(
  () => import('./mini-calendar').then((m) => m.MiniCalendar),
  { ssr: false, loading: () => null },
)
