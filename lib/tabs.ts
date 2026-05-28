import { Home, CalendarDays, Camera, GraduationCap, Repeat, Settings } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export type Tab = {
  href: string
  icon: LucideIcon
  label: string
}

export const TABS: readonly Tab[] = [
  { href: '/',                  icon: Home,           label: '홈' },
  { href: '/timetable',         icon: CalendarDays,   label: '시간표' },
  { href: '/homework/upload',   icon: Camera,         label: '업로드' },
  { href: '/academies',         icon: GraduationCap,  label: '학원' },
  { href: '/recurring',         icon: Repeat,         label: '매일/매주' },
  { href: '/admin/settings',    icon: Settings,       label: '설정' },
] as const

/**
 * 현재 pathname이 속한 부모 탭의 인덱스. 매칭 없으면 -1.
 *
 * 매칭 순서:
 *   1) 정확 매칭 (TABS[i].href === pathname)
 *   2) prefix 매칭 (pathname이 TABS[i].href + '/' 로 시작) — 가장 긴 href 우선.
 *      '/'(홈)는 모든 경로의 prefix라 prefix 매칭에서 제외 (정확 매칭만 인정).
 *
 * 효과: `/academies/2` → idx 3 (학원), `/homework/upload/history` → idx 2 (업로드).
 * 매칭 안 되는 경로(`/day/...`, `/homework/batches/...`, `/admin/stickers/...`)는
 * -1 — swipe-nav가 idx -1이면 스와이프 무효 처리.
 */
export function currentTabIndex(pathname: string): number {
  const exact = TABS.findIndex((t) => t.href === pathname)
  if (exact !== -1) return exact

  let best = -1
  let bestLen = 0
  for (let i = 0; i < TABS.length; i++) {
    const href = TABS[i].href
    if (href === '/') continue  // 홈은 정확 매칭만
    if (pathname.startsWith(href + '/')) {
      if (href.length > bestLen) {
        best = i
        bestLen = href.length
      }
    }
  }
  return best
}
