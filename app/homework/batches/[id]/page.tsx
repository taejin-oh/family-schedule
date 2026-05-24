'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { Loader2, CheckCircle2, XCircle, Hourglass } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

const LABEL: Record<string, string> = {
  pending: '대기 중',
  processing: '분석 중',
  ready: '추출 완료',
  committed: '확정됨',
  failed: '실패',
}

const HINT: Record<string, string> = {
  pending: '워커가 작업을 가져갈 때까지 잠시 기다리는 중',
  processing: 'AI가 파일을 읽고 숙제 항목을 뽑아내고 있어요 (보통 30초~3분)',
  ready: '리뷰 화면으로 이동합니다…',
  committed: '이미 확정된 batch입니다',
  failed: '아래 사유를 확인하고 다시 시도해주세요',
}

function ActiveDots() {
  const [n, setN] = useState(1)
  useEffect(() => {
    const t = setInterval(() => setN((v) => (v % 3) + 1), 450)
    return () => clearInterval(t)
  }, [])
  return <span aria-hidden>{'.'.repeat(n)}</span>
}

function ElapsedTime({ startedAt }: { startedAt: number }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  const secs = Math.floor((now - startedAt) / 1000)
  if (secs < 5) return null
  if (secs < 60) return <span>{secs}초 경과</span>
  return <span>{Math.floor(secs / 60)}분 {secs % 60}초 경과</span>
}

export default function ProcessingPage() {
  const params = useParams<{ id: string }>()
  const id = params.id
  const router = useRouter()
  const [status, setStatus] = useState<string>('pending')
  const [reason, setReason] = useState<string | null>(null)
  const [connError, setConnError] = useState<boolean>(false)
  const [startedAt] = useState<number>(Date.now())

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
      setConnError(true)
    })
    return () => es.close()
  }, [id, router])

  const isActive = status === 'pending' || status === 'processing'
  const Icon =
    status === 'failed' ? XCircle :
    status === 'ready' || status === 'committed' ? CheckCircle2 :
    status === 'pending' ? Hourglass :
    Loader2

  return (
    <Card className="p-8 space-y-4 text-center">
      <div className="flex justify-center">
        <Icon
          className={
            status === 'failed' ? 'h-10 w-10 text-destructive' :
            status === 'ready' || status === 'committed' ? 'h-10 w-10 text-green-600' :
            status === 'processing' ? 'h-10 w-10 text-primary animate-spin' :
            'h-10 w-10 text-muted-foreground animate-pulse'
          }
        />
      </div>

      <div className="text-lg font-semibold">
        {LABEL[status] ?? status}
        {isActive && <ActiveDots />}
      </div>

      <div className="text-sm text-muted-foreground">{HINT[status]}</div>

      {isActive && (
        <div className="text-xs text-muted-foreground tabular-nums">
          <ElapsedTime startedAt={startedAt} />
        </div>
      )}

      <div className="text-xs text-muted-foreground">batch #{id}</div>

      {status === 'failed' && (
        <div className="space-y-3 pt-2">
          <div className="text-sm text-destructive bg-destructive/10 rounded-md p-3 text-left whitespace-pre-wrap break-words">
            {reason ?? '알 수 없는 오류'}
          </div>
          <Button onClick={() => router.push('/homework/upload')}>
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
