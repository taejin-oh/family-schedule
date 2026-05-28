'use client'

import { useEffect } from 'react'
import { track } from '@/lib/log/client'

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    track('error', 'global_uncaught', {
      message: error.message,
      digest: error.digest,
      stack_head: error.stack?.split('\n').slice(0, 4).join('\n'),
    })
  }, [error])

  return (
    <html lang="ko">
      <body>
        <div style={{ padding: 16, fontFamily: 'system-ui, sans-serif' }}>
          <h1 style={{ fontSize: 20, marginBottom: 8 }}>심각한 오류</h1>
          <pre style={{ fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{error.message}</pre>
          <button onClick={reset} style={{ marginTop: 12, padding: '6px 12px' }}>다시 시도</button>
        </div>
      </body>
    </html>
  )
}
