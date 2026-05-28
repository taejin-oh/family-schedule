import './globals.css'
import Link from 'next/link'
import { Geist_Mono } from 'next/font/google'
import type { Metadata, Viewport } from 'next'
import { BottomNav } from '@/components/bottom-nav'
import { SwipeNav } from '@/components/swipe-nav'
import { ToastProvider } from '@/components/toast'
import { ServiceWorkerRegister } from '@/components/sw-register'
import { AnalyticsTracker } from '@/components/analytics-tracker'

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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className={geistMono.variable}>
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
          <header className="border-b bg-card hidden md:block sticky top-0 z-40">
            <div className="mx-auto max-w-3xl flex items-center gap-6 p-4">
              <Link href="/" className="font-semibold text-base">📚 가족 스케줄</Link>
              <nav className="flex gap-4 text-sm font-medium text-muted-foreground">
                <Link href="/dashboard" className="hover:text-foreground transition-colors">대시보드</Link>
                <Link href="/academies" className="hover:text-foreground transition-colors">학원</Link>
                <Link href="/timetable" className="hover:text-foreground transition-colors">시간표</Link>
                <Link href="/homework/upload" className="hover:text-foreground transition-colors">숙제 추가</Link>
                <Link href="/recurring" className="hover:text-foreground transition-colors">매일/매주 할 일</Link>
                <Link href="/admin/settings" className="hover:text-foreground transition-colors">설정</Link>
              </nav>
            </div>
          </header>
          <main className="mx-auto max-w-3xl p-4 pb-20 md:pb-4 min-h-[100dvh] md:min-h-0 flex flex-col overflow-x-clip">
            <SwipeNav>{children}</SwipeNav>
          </main>
          <BottomNav />
        </ToastProvider>
      </body>
    </html>
  )
}
