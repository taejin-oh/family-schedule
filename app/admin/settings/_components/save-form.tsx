'use client'

import { useEffect, useRef, useState, useTransition, type ReactNode } from 'react'
import { Check, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

type Status = 'idle' | 'pending' | 'success' | 'error'

type Props = {
  action: (formData: FormData) => Promise<unknown>
  submitLabel: string
  successLabel?: string
  pendingLabel?: string
  className?: string
  /** override base button class for layout 차이 (그 외 색·전환은 status별 자동) */
  buttonBaseClassName?: string
  children: ReactNode
}

/**
 * Server action을 호출하는 form. 버튼 자체가 상태에 따라 morph:
 *   idle    → submitLabel
 *   pending → Loader2 spinner + pendingLabel
 *   success → Check icon + successLabel (2초 후 idle)
 *   error   → 원래 라벨 + 버튼 옆 inline 에러 메시지 (4초 후 idle)
 *
 * Toast 안 씀 — 버튼 위 상태가 결과 자체. input은 잠그지 않아서 즉시 다시 수정 가능.
 */
export function SaveForm({
  action,
  submitLabel,
  successLabel = '저장됨',
  pendingLabel = '저장 중',
  className,
  buttonBaseClassName,
  children,
}: Props) {
  const [status, setStatus] = useState<Status>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [, startTransition] = useTransition()
  const timerRef = useRef<number | null>(null)

  function clearStatusTimer() {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }
  useEffect(() => clearStatusTimer, [])

  function handle(formData: FormData) {
    clearStatusTimer()
    setErrorMsg(null)
    setStatus('pending')
    startTransition(async () => {
      try {
        await action(formData)
        setStatus('success')
        timerRef.current = window.setTimeout(() => setStatus('idle'), 2000)
      } catch (e) {
        const msg = e instanceof Error && e.message ? e.message : '저장 실패'
        setErrorMsg(msg)
        setStatus('error')
        timerRef.current = window.setTimeout(() => {
          setStatus('idle')
          setErrorMsg(null)
        }, 4000)
      }
    })
  }

  const baseBtn =
    buttonBaseClassName ??
    'inline-flex items-center gap-1.5 text-sm font-semibold rounded-lg px-3 py-1.5 transition-colors self-start'

  return (
    <form action={handle} className={className}>
      {children}
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={status === 'pending'}
          aria-busy={status === 'pending'}
          className={cn(
            baseBtn,
            status === 'idle' && 'bg-foreground text-background hover:opacity-90',
            status === 'pending' && 'bg-foreground/70 text-background cursor-wait',
            status === 'success' && 'bg-good text-white',
            status === 'error' && 'bg-foreground text-background hover:opacity-90',
          )}
        >
          {status === 'pending' && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          {status === 'success' && <Check className="h-4 w-4" aria-hidden />}
          <span>
            {status === 'pending' ? pendingLabel
             : status === 'success' ? successLabel
             : submitLabel}
          </span>
        </button>
        {status === 'error' && errorMsg && (
          <span className="text-xs text-destructive" role="alert">{errorMsg}</span>
        )}
      </div>
    </form>
  )
}
