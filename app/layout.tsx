import './globals.css'
import Link from 'next/link'
import { Geist_Mono } from 'next/font/google'
import type { Metadata, Viewport } from 'next'
import { BottomNav } from '@/components/bottom-nav'
import { SideNav } from '@/components/side-nav'
import { SwipeNav } from '@/components/swipe-nav'
import { ToastProvider } from '@/components/toast'
import { ServiceWorkerRegister } from '@/components/sw-register'
import { AnalyticsTracker } from '@/components/analytics-tracker'
import { getSettings } from '@/server/actions/settings'

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: 'Family Schedule',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Family Schedule',
  },
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: '/icons/apple-touch-icon.png',
  },
}

export const viewport: Viewport = {
  themeColor: '#0f172a',
  viewportFit: 'cover',
  width: 'device-width',
  initialScale: 1,
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // 설정의 색 테마(맑음/포근)를 SSR로 <html data-theme>에 부여 → 깜빡임 없음.
  const settings = await getSettings()
  const dataTheme = settings.theme === 'warm' ? 'warm' : undefined
  return (
    <html lang="ko" data-theme={dataTheme} className={geistMono.variable}>
      <head>
        {/* Pretendard 폰트 CDN — TLS handshake/DNS를 page paint 전에 미리 시작 → 200~500ms 단축. */}
        <link rel="dns-prefetch" href="https://cdn.jsdelivr.net" />
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="" />
        <link
          rel="stylesheet"
          as="style"
          crossOrigin=""
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body className="min-h-screen bg-background text-foreground antialiased font-sans">
        <ServiceWorkerRegister />
        <AnalyticsTracker />
        <ToastProvider>
          <div className="lg:flex lg:items-start">
            {/* lg+(가로/PC): 좌측 사이드바. 모바일 하단탭 + md 상단헤더를 대체. */}
            <SideNav />
            <div className="flex-1 min-w-0 flex flex-col">
              {/* md..lg 사이 (태블릿 세로 등): 상단 헤더 내비. lg+는 사이드바가 대신. */}
              <header className="border-b bg-card hidden md:block lg:hidden sticky top-0 z-40">
                <div className="mx-auto max-w-3xl flex items-center gap-6 p-4">
                  <Link href="/" className="font-semibold text-base">📚 가족 스케줄</Link>
                  <nav className="flex gap-4 text-sm font-medium text-muted-foreground">
                    <Link href="/kids" className="hover:text-foreground transition-colors">아이홈</Link>
                    <Link href="/academies" className="hover:text-foreground transition-colors">학원</Link>
                    <Link href="/timetable" className="hover:text-foreground transition-colors">시간표</Link>
                    <Link href="/homework/upload" className="hover:text-foreground transition-colors">숙제 추가</Link>
                    <Link href="/recurring" className="hover:text-foreground transition-colors">매일/매주 할 일</Link>
                    <Link href="/admin/settings" className="hover:text-foreground transition-colors">설정</Link>
                  </nav>
                </div>
              </header>
              <main className="mx-auto w-full max-w-3xl lg:max-w-6xl p-4 pb-20 md:pb-4 lg:px-8 lg:py-7 min-h-[100dvh] md:min-h-0 lg:min-h-screen flex flex-col overflow-x-clip">
                <SwipeNav>{children}</SwipeNav>
              </main>
            </div>
          </div>
          <BottomNav />
        </ToastProvider>
      </body>
    </html>
  )
}
