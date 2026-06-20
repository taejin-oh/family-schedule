'use client'

import { useFormStatus } from 'react-dom'
import { cn } from '@/lib/utils'

/** 리포트 생성 버튼 — 서버 액션(codex 호출) 진행 중엔 스피너 + "생성 중…"로 먹통 방지. */
export function RegenerateButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={cn(
        'inline-flex items-center gap-1.5 text-sm font-semibold rounded-lg px-3 py-2 transition-opacity',
        pending
          ? 'bg-muted text-muted-foreground cursor-wait'
          : 'bg-foreground text-background hover:opacity-90',
      )}
    >
      {pending ? (
        <>
          <span
            className="inline-block w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin"
            aria-hidden
          />
          생성 중…
        </>
      ) : (
        '이번 주 리포트 생성/재생성'
      )}
    </button>
  )
}
