'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, CalendarDays, Camera, GraduationCap, Repeat, Settings } from 'lucide-react'
import { cn } from '@/lib/utils'

const TABS = [
  { href: '/',                  icon: Home,           label: '홈' },
  { href: '/timetable',         icon: CalendarDays,   label: '시간표' },
  { href: '/homework/upload',   icon: Camera,         label: '업로드' },
  { href: '/academies',         icon: GraduationCap,  label: '학원' },
  { href: '/recurring',         icon: Repeat,         label: '매일' },
  { href: '/admin/settings',    icon: Settings,       label: '설정' },
] as const

export function BottomNav() {
  const pathname = usePathname()

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 md:hidden bg-background border-t pb-[env(safe-area-inset-bottom)]"
      aria-label="하단 내비게이션"
    >
      <div className="grid grid-cols-6 h-14">
        {TABS.map(({ href, icon: Icon, label }) => {
          const isActive =
            href === '/' ? pathname === '/' : pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex h-full w-full flex-col items-center justify-center gap-1 text-xs transition-colors touch-manipulation',
                isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
              )}
              aria-current={isActive ? 'page' : undefined}
            >
              <Icon className="h-5 w-5 shrink-0 pointer-events-none" aria-hidden />
              <span className="pointer-events-none">{label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
