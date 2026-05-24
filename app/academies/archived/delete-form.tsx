'use client'

import { useTransition } from 'react'
import { Button } from '@/components/ui/button'

export function PermanentDeleteForm({
  id,
  name,
  action,
}: {
  id: number
  name: string
  action: (id: number, name: string) => Promise<void>
}) {
  const [pending, start] = useTransition()

  function handleClick() {
    const msg =
      `정말로 "${name}"을(를) 영구 삭제할까요?\n\n` +
      `이 학원의 모든 batch, 추출된 숙제 항목, 사진 파일 참조가 함께 제거됩니다. 되돌릴 수 없습니다.`
    if (!window.confirm(msg)) return
    start(async () => {
      await action(id, name)
    })
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={handleClick}
      disabled={pending}
      className="text-destructive hover:text-destructive"
    >
      {pending ? '삭제 중…' : '영구 삭제'}
    </Button>
  )
}
