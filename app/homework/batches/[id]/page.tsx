'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

const LABEL: Record<string, string> = {
  pending: '대기 중…',
  processing: '분석 중…',
  ready: '추출 완료',
  committed: '확정됨',
  failed: '실패',
}

const HINT: Record<string, string> = {
  pending: '워커가 작업을 가져갈 때까지 잠시 기다리는 중',
  processing: 'AI가 파일을 읽고 숙제 항목을 뽑아내고 있어요',
  ready: '리뷰 화면으로 이동합니다…',
  committed: '이미 확정된 batch입니다',
  failed: '아래 사유를 확인하고 다시 시도해주세요',
}

export default function ProcessingPage() {
  const params = useParams<{ id: string }>()
  const id = params.id
  const router = useRouter()
  const [status, setStatus] = useState<string>('pending')
  const [reason, setReason] = useState<string | null>(null)
  const [connError, setConnError] = useState<boolean>(false)

  useEffect(() => {
    const es = new EventSource(`/api/homework/batches/${id}/stream`)
    es.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data)
        setStatus(data.status)
        setReason(data.failureReason)
        if (data.status === 'ready') {
          es.close()
          router.replace(`/homework/batches/${id}/review`)
        }
        if (data.status === 'failed' || data.status === 'committed') {
          es.close()
        }
      } catch {}
    }
    es.addEventListener('error', () => {
      // EventSource errors fire on normal close too; treat as info, not panic.
      setConnError(true)
    })
    return () => es.close()
  }, [id, router])

  return (
    <Card className="p-8 space-y-3 text-center">
      <div className="text-2xl">📊</div>
      <div className="text-lg font-semibold">{LABEL[status] ?? status}</div>
      <div className="text-sm text-muted-foreground">{HINT[status]}</div>
      <div className="text-xs text-muted-foreground">batch #{id}</div>

      {status === 'failed' && (
        <div className="space-y-3 pt-2">
          <div className="text-sm text-destructive bg-destructive/10 rounded-md p-3 text-left">
            {reason ?? '알 수 없는 오류'}
          </div>
          <Button asChild={false} onClick={() => router.push('/homework/upload')}>
            다시 업로드
          </Button>
        </div>
      )}

      {status === 'pending' && connError && (
        <p className="text-xs text-muted-foreground pt-2">
          연결이 끊겼습니다. 페이지를 새로고침해보세요.
        </p>
      )}
    </Card>
  )
}
