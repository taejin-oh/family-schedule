'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { Check, Loader2, XCircle } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { LoadingDots } from '@/components/loading-dots'
import { deleteBatch } from '@/server/actions/academy-detail'
import { cn } from '@/lib/utils'

// AI 처리 단계 — 실제 server는 'processing' 한 상태로 묶여있어서,
// client에서 시간 흐름으로 가짜 단계 진행을 보여준다.
// (단순 spinner보다 체감 대기 시간 30~40% 단축; Telerik / NN/g 참고)
const STAGES = [
  { key: 'upload',  label: '사진 업로드 완료',  startSec: 0 },
  { key: 'read',    label: 'AI가 내용 읽는 중', startSec: 0 },
  { key: 'extract', label: '항목 추출 중',      startSec: 3 },
  { key: 'format',  label: '정리 중',           startSec: 10 },
] as const

function ElapsedTime({ since }: { since: number }) {
  const [secs, setSecs] = useState(0)
  useEffect(() => {
    const initId = window.setTimeout(() => setSecs(Math.floor((Date.now() - since) / 1000)), 0)
    const t = window.setInterval(() => setSecs(Math.floor((Date.now() - since) / 1000)), 1000)
    return () => { window.clearTimeout(initId); window.clearInterval(t) }
  }, [since])
  if (secs < 5) return null
  if (secs < 60) return <span>{secs}초 경과</span>
  return <span>{Math.floor(secs / 60)}분 {secs % 60}초 경과</span>
}

type Status = 'pending' | 'processing' | 'ready' | 'committed' | 'failed' | 'unknown'

export default function ProcessingPage() {
  const params = useParams<{ id: string }>()
  const id = params.id
  const router = useRouter()
  const [status, setStatus] = useState<Status>('pending')
  const [reason, setReason] = useState<string | null>(null)
  const [connError, setConnError] = useState<boolean>(false)
  const [processingStartedAt, setProcessingStartedAt] = useState<number | null>(null)
  const [processingElapsed, setProcessingElapsed] = useState(0)
  const [pageMountedAt] = useState(() => Date.now())
  const [cancelPending, startCancelTransition] = useTransition()

  function handleCancel() {
    const ok = window.confirm(
      '분석을 취소할까요?\n\n이 batch와 업로드한 사진이 영구 삭제됩니다.\n분석 중인 AI 호출은 그대로 끝나지만 결과는 버려집니다.',
    )
    if (!ok) return
    startCancelTransition(async () => {
      await deleteBatch(Number(id))
      router.push('/homework/upload')
    })
  }

  // SSE — server-pushed status updates.
  useEffect(() => {
    // SPA navigation이 어떤 이유로 시작 안 되면 5초 뒤 hard reload로 강제 이동.
    function scheduleNavigationFallback(targetPath: string) {
      window.setTimeout(() => {
        if (
          window.location.pathname.startsWith('/homework/batches/') &&
          !window.location.pathname.includes('/review')
        ) {
          window.location.href = targetPath
        }
      }, 5000)
    }

    const es = new EventSource(`/api/homework/batches/${id}/stream`)
    es.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data) as { status: Status; failureReason: string | null }
        setStatus(data.status)
        setReason(data.failureReason)
        if (data.status === 'processing') {
          setProcessingStartedAt((prev) => prev ?? Date.now())
        }
        if (data.status === 'ready' || data.status === 'committed') {
          es.close()
          // ready든 committed든 review 페이지에서 처리 (committed는 read-only 모드).
          const target = `/homework/batches/${id}/review`
          router.replace(target)
          scheduleNavigationFallback(target)
        }
        if (data.status === 'failed') {
          es.close()
        }
      } catch {}
    }
    es.addEventListener('error', () => setConnError(true))
    return () => es.close()
  }, [id, router])

  // processing 진행 중 client 타이머 — 단계 계산용.
  useEffect(() => {
    if (processingStartedAt === null) return
    const t = setInterval(() => {
      setProcessingElapsed((Date.now() - processingStartedAt) / 1000)
    }, 500)
    return () => clearInterval(t)
  }, [processingStartedAt])

  const isFailed = status === 'failed'
  const isTerminal = status === 'ready' || status === 'committed' || status === 'failed'

  // 현재 active 단계 인덱스 계산.
  // - status === 'pending': stage 1(읽기) active
  // - status === 'processing': elapsed에 따라 1 → 2 → 3 사이 이동
  // - terminal (ready/committed): 모두 완료
  // - failed: 현재 단계 중단 (-1)
  let activeIdx = 1
  if (status === 'processing') {
    if (processingElapsed >= STAGES[3].startSec) activeIdx = 3
    else if (processingElapsed >= STAGES[2].startSec) activeIdx = 2
    else activeIdx = 1
  } else if (status === 'ready' || status === 'committed') {
    activeIdx = 4
  } else if (status === 'failed') {
    activeIdx = -1
  }

  return (
    <Card className="p-6 sm:p-8 space-y-5">
      <div className="text-center space-y-1.5">
        <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
          {isFailed ? '실패' : isTerminal ? '완료' : '처리 중'}
        </div>
        <div className="text-xl font-bold inline-flex items-center justify-center gap-2">
          {isFailed ? (
            '분석에 실패했어요'
          ) : isTerminal ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin text-primary" aria-hidden />
              <span>곧 결과 화면으로 이동합니다<LoadingDots /></span>
            </>
          ) : (
            '잠시만 기다려주세요'
          )}
        </div>
        {!isTerminal && !isFailed && (
          <div className="text-xs text-muted-foreground tabular-nums">
            <ElapsedTime since={pageMountedAt} />
          </div>
        )}
      </div>

      <ul className="space-y-2.5">
        {STAGES.map((s, i) => {
          const done = isFailed ? i < 1 : activeIdx > i || activeIdx === 4
          const active = !isFailed && activeIdx === i && !done
          const pending = !done && !active
          return (
            <li
              key={s.key}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-lg transition-colors',
                active && 'bg-primary/5',
              )}
            >
              <span
                className={cn(
                  'shrink-0 w-7 h-7 rounded-full flex items-center justify-center',
                  done && 'bg-green-600 text-white',
                  active && 'bg-primary text-primary-foreground',
                  pending && 'bg-muted text-muted-foreground',
                )}
                aria-hidden
              >
                {done ? (
                  <Check className="h-4 w-4" strokeWidth={3} />
                ) : active ? (
                  <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.5} />
                ) : (
                  <span className="text-xs font-bold">{i + 1}</span>
                )}
              </span>
              <span
                className={cn(
                  'text-sm',
                  done && 'text-foreground',
                  active && 'font-semibold text-foreground',
                  pending && 'text-muted-foreground',
                )}
              >
                {s.label}
              </span>
            </li>
          )
        })}
      </ul>

      <div className="text-center text-xs text-muted-foreground">batch #{id}</div>

      {isFailed && (
        <div className="space-y-3 pt-2">
          <div className="text-sm text-destructive bg-destructive/10 rounded-md p-3 flex items-start gap-2">
            <XCircle className="h-4 w-4 mt-0.5 shrink-0" aria-hidden />
            <span className="whitespace-pre-wrap break-words">{reason ?? '알 수 없는 오류'}</span>
          </div>
          <Button onClick={() => router.push('/homework/upload')} className="w-full">
            다시 업로드
          </Button>
        </div>
      )}

      {!isTerminal && connError && (
        <p className="text-center text-xs text-muted-foreground pt-1">
          연결이 끊겼습니다. 페이지를 새로고침해보세요.
        </p>
      )}

      {/* 처리 중(pending/processing) 일 때 사용자가 빠져나갈 escape hatch.
          isTerminal/isFailed면 이미 review 또는 다시 업로드 흐름으로 진입. */}
      {!isTerminal && !isFailed && (
        <div className="pt-1">
          <Button
            variant="outline"
            size="sm"
            onClick={handleCancel}
            disabled={cancelPending}
            className="w-full text-muted-foreground hover:text-destructive hover:border-destructive/40"
          >
            {cancelPending ? '취소 중…' : '분석 취소하고 업로드 화면으로'}
          </Button>
        </div>
      )}
    </Card>
  )
}
