import './globals.css'
import Link from 'next/link'
import { Geist, Geist_Mono } from 'next/font/google'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

export const metadata = { title: 'Family Schedule' }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body className="min-h-screen bg-background text-foreground antialiased font-sans">
        <header className="border-b bg-card">
          <div className="mx-auto max-w-3xl flex items-center gap-6 p-4">
            <Link href="/" className="font-semibold text-base">📚 가족 스케줄</Link>
            <nav className="flex gap-4 text-sm font-medium text-muted-foreground">
              <Link href="/academies" className="hover:text-foreground transition-colors">학원</Link>
              <Link href="/homework/upload" className="hover:text-foreground transition-colors">사진 추가</Link>
              <Link href="/admin/settings" className="hover:text-foreground transition-colors">설정</Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-3xl p-4">{children}</main>
      </body>
    </html>
  )
}
