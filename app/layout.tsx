import './globals.css'
import Link from 'next/link'

export const metadata = { title: 'Family Schedule' }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="min-h-screen bg-gray-50 text-gray-900">
        <header className="border-b bg-white">
          <div className="mx-auto max-w-3xl flex items-center gap-4 p-3">
            <Link href="/" className="font-semibold">📚 가족 스케줄</Link>
            <nav className="flex gap-3 text-sm">
              <Link href="/academies">학원</Link>
              <Link href="/homework/upload">사진 추가</Link>
              <Link href="/admin/settings">설정</Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-3xl p-4">{children}</main>
      </body>
    </html>
  )
}
