'use client'

import { useEffect, useState } from 'react'

/**
 * 길게 진행 중인 작업의 끝에 . / .. / ... 가 0.45초 간격으로 돌게 한다.
 * 사용 예: `업로드 중<LoadingDots />` → "업로드 중.", "업로드 중..", "업로드 중..."
 */
export function LoadingDots() {
  const [n, setN] = useState(1)
  useEffect(() => {
    const t = setInterval(() => setN((v) => (v % 3) + 1), 450)
    return () => clearInterval(t)
  }, [])
  return <span aria-hidden>{'.'.repeat(n)}</span>
}
