'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, ListChecks, CalendarDays, GraduationCap, Camera, Repeat, Settings } from 'lucide-react'
import { cn } from '@/lib/utils'

// 가로모드/PC(lg+) 좌측 사이드바 내비. 모바일 하단탭 + md 상단헤더를 대체.
const NAV = [
  { href: '/', icon: Home, label: '홈' },
  { href: '/dashboard', icon: ListChecks, label: '할 일' },
  { href: '/timetable', icon: CalendarDays, label: '시간표' },
  { href: '/academies', icon: GraduationCap, label: '학원' },
  { href: '/homework/upload', icon: Camera, label: '숙제 추가' },
  { href: '/recurring', icon: Repeat, label: '매일/매주' },
] as const

export function SideNav() {
  const pathname = usePathname()

  function isActive(href: string) {
    if (href === '/') return pathname === '/'
    if (href === '/dashboard') return pathname.startsWith('/dashboard')
    return pathname === href || pathname.startsWith(href + '/')
  }

  const rowCls = (active: boolean) =>
    cn(
      'flex items-center gap-3 px-3 py-2.5 rounded-[11px] text-[14.5px] transition-colors',
      active
        ? 'bg-brand/10 text-foreground font-bold'
        : 'text-muted-foreground hover:bg-accent hover:text-foreground font-semibold',
    )

  return (
    <aside className="hidden lg:flex lg:flex-col lg:w-[212px] lg:shrink-0 lg:sticky lg:top-0 lg:h-screen bg-card border-r border-border px-3.5 py-5 overflow-y-auto">
      <Link href="/" prefetch className="flex items-center gap-2.5 px-2 pb-4">
        <span className="w-[30px] h-[30px] rounded-[9px] bg-brand/10 flex items-center justify-center text-base">📚</span>
        <span className="text-[15.5px] font-extrabold tracking-tight whitespace-nowrap">가족 스케줄</span>
      </Link>
      <nav className="flex flex-col gap-1">
        {NAV.map(({ href, icon: Icon, label }) => (
          <Link key={href} href={href} prefetch className={rowCls(isActive(href))} aria-current={isActive(href) ? 'page' : undefined}>
            <Icon className="w-5 h-5 shrink-0" aria-hidden />
            <span className="whitespace-nowrap">{label}</span>
          </Link>
        ))}
      </nav>
      <div className="mt-auto pt-3">
        <Link href="/admin/settings" prefetch className={rowCls(pathname.startsWith('/admin/settings'))} aria-current={pathname.startsWith('/admin/settings') ? 'page' : undefined}>
          <Settings className="w-5 h-5 shrink-0" aria-hidden />
          <span className="whitespace-nowrap">설정</span>
        </Link>
      </div>
    </aside>
  )
}
