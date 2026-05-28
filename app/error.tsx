'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { track } from '@/lib/log/client'

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    track('error', 'uncaught', {
      message: error.message,
      digest: error.digest,
      stack_head: error.stack?.split('\n').slice(0, 4).join('\n'),
    })
  }, [error])

  return (
    <div className="space-y-4">
      <header className="px-1 pt-2 pb-1">
        <h1 className="text-[24px] leading-tight font-bold tracking-tight">문제가 생겼어요</h1>
        <p className="text-sm text-muted-foreground mt-0.5">잠시 후 다시 시도해줘.</p>
      </header>
      <Card className="p-4 gap-2">
        <pre className="text-xs text-muted-foreground whitespace-pre-wrap break-words">{error.message}</pre>
        <Button onClick={reset} className="mt-2">다시 시도</Button>
      </Card>
    </div>
  )
}
