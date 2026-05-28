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

// Returns -1 when the current path is not an exact tab root (sub-pages disable swipe).
export function currentTabIndex(pathname: string): number {
  return TABS.findIndex((t) => t.href === pathname)
}
