'use client'

import { useTransition, type ReactNode } from 'react'
import { useToast } from '@/components/toast'

type Props = {
  action: (formData: FormData) => Promise<unknown>
  submitLabel: string
  successMsg: string
  pendingLabel?: string
  className?: string
  buttonClassName?: string
  children: ReactNode
}

/**
 * Server action을 호출하는 form을 감싸서:
 * - 진행 중: 버튼 disabled + "저장 중…" 텍스트, fieldset 잠금
 * - 성공: toast로 successMsg 표시
 * - 실패: throw된 메시지 toast 표시
 *
 * 사용처: 설정 페이지의 server action form 어디든.
 */
export function SaveForm({
  action,
  submitLabel,
  successMsg,
  pendingLabel = '저장 중…',
  className,
  buttonClassName,
  children,
}: Props) {
  const { show } = useToast()
  const [pending, startTransition] = useTransition()

  function handle(formData: FormData) {
    startTransition(async () => {
      try {
        await action(formData)
        show({ label: successMsg })
      } catch (e) {
        show({ label: e instanceof Error && e.message ? e.message : '저장 실패' })
      }
    })
  }

  return (
    <form action={handle} className={className}>
      <fieldset disabled={pending} className="contents">
        {children}
        <button
          type="submit"
          disabled={pending}
          className={
            buttonClassName ??
            'bg-foreground text-background text-sm font-semibold rounded-lg px-3 py-1.5 hover:opacity-90 disabled:opacity-50 disabled:cursor-wait transition-opacity self-start'
          }
        >
          {pending ? pendingLabel : submitLabel}
        </button>
      </fieldset>
    </form>
  )
}
