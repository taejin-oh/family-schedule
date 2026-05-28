'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import { deleteBatch } from '@/server/actions/academy-detail'

type Batch = {
  id: number
  capturedAt: Date
  status: 'pending'|'processing'|'ready'|'committed'|'failed'
  providerUsed: string | null
  modelUsed: string | null
  photoCount: number
  itemCount: number
}

function formatTime(d: Date): string {
  const M = d.getMonth() + 1
  const D = d.getDate()
  const h = d.getHours()
  const m = d.getMinutes()
  const ampm = h < 12 ? '오전' : '오후'
  const hh = h === 0 ? 12 : h > 12 ? h - 12 : h
  return `${M}/${D} ${ampm} ${hh}:${String(m).padStart(2, '0')}`
}

function statusLabel(s: Batch['status']): string {
  switch (s) {
    case 'committed': return '확정'
    case 'ready': return '검토 대기'
    case 'pending': return '대기'
    case 'processing': return '처리 중'
    case 'failed': return '실패'
  }
}

/**
 * 학원 단위 업로드 배치 일괄 삭제. 학원 상세 페이지 하단 collapsed details.
 * 한 번 누르면 confirm() 후 cascade로 items + photos + photo 파일 모두 영구 삭제.
 * 5초 지연 패턴(Undo 토스트)은 적용 안 함 — photo 파일 unlink가 비가역이라 confirm 1회로 통일.
 */
export function BatchesRollback({ batches }: { batches: Batch[] }) {
  const router = useRouter()
  const [pendingId, setPendingId] = useState<number | null>(null)
  const [, startTransition] = useTransition()

  if (batches.length === 0) return null

  function handleDelete(b: Batch) {
    const msg = `이 업로드 배치를 통째로 삭제할까요?\n\n- ${formatTime(b.capturedAt)}\n- 숙제 ${b.itemCount}건, 사진 ${b.photoCount}장\n\n되돌릴 수 없습니다.`
    if (!window.confirm(msg)) return
    setPendingId(b.id)
    startTransition(async () => {
      await deleteBatch(b.id)
      setPendingId(null)
      router.refresh()
    })
  }

  return (
    <details className="rounded-xl ring-1 ring-foreground/10 bg-card overflow-hidden">
      <summary className="cursor-pointer select-none flex items-center justify-between px-4 py-3 text-sm font-medium hover:bg-accent/40 transition-colors">
        <span>🗑️ 업로드 이력 (삭제)</span>
        <span className="text-xs text-muted-foreground">{batches.length}건</span>
      </summary>
      <div className="border-t divide-y">
        {batches.map((b) => (
          <div key={b.id} className="px-4 py-3 flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <div className="text-sm">
                <span className="font-medium">{formatTime(b.capturedAt)}</span>
                <span className="text-muted-foreground"> · {statusLabel(b.status)} · 숙제 {b.itemCount}건, 사진 {b.photoCount}장</span>
              </div>
              {(b.providerUsed || b.modelUsed) && (
                <div className="text-xs text-muted-foreground mt-0.5">
                  {b.providerUsed}{b.providerUsed && b.modelUsed && ' · '}{b.modelUsed}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => handleDelete(b)}
              disabled={pendingId === b.id}
              className="inline-flex items-center gap-1 text-xs text-destructive hover:underline disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
              {pendingId === b.id ? '삭제 중…' : '삭제'}
            </button>
          </div>
        ))}
      </div>
    </details>
  )
}
