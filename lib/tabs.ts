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
 * 일부 페이지는 TABS에 없지만 특정 탭과 같은 swipe 위치를 공유해야 함.
 * 예: `/dashboard`(관리)는 홈(`/`)에서 "관리" 링크로 진입하는 자매 페이지로,
 * 모바일에서 좌우 swipe로 인접 탭 이동이 가능해야 함. 홈 위치(idx 0)에 매핑.
 *
 * key는 정확 매칭만 — sub-page 매칭이 필요하면 항목 추가.
 */
const TAB_ALIAS: Readonly<Record<string, string>> = {
  '/dashboard': '/',
}

/**
 * 현재 pathname이 속한 부모 탭의 인덱스. 매칭 없으면 -1.
 *
 * 매칭 순서:
 *   1) 정확 매칭 (TABS[i].href === pathname)
 *   2) alias 매칭 (TAB_ALIAS[pathname] → TABS 정확 매칭)
 *   3) prefix 매칭 (pathname이 TABS[i].href + '/' 로 시작) — 가장 긴 href 우선.
 *      '/'(홈)는 모든 경로의 prefix라 prefix 매칭에서 제외 (정확 매칭만 인정).
 *
 * 효과: `/academies/2` → idx 3 (학원), `/homework/upload/history` → idx 2 (업로드),
 * `/dashboard` → idx 0 (홈).
 * 매칭 안 되는 경로(`/day/...`, `/homework/batches/...`, `/admin/stickers/...`)는
 * -1 — swipe-nav가 idx -1이면 스와이프 무효 처리.
 */
export function currentTabIndex(pathname: string): number {
  const exact = TABS.findIndex((t) => t.href === pathname)
  if (exact !== -1) return exact

  const aliased = TAB_ALIAS[pathname]
  if (aliased !== undefined) {
    const aliasIdx = TABS.findIndex((t) => t.href === aliased)
    if (aliasIdx !== -1) return aliasIdx
  }

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
