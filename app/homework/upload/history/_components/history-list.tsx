'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { deleteBatch } from '@/server/actions/homework'
import { BatchCard } from '../../batch-card'

type BatchSummary = {
  id: number
  academyId: number
  capturedAt: Date
  status: 'pending' | 'processing' | 'ready' | 'committed' | 'failed'
  userHint: string | null
  failureReason: string | null
  photoCount: number
  firstPhotoPath: string | null
  isPdf: boolean
  itemCount: number
  minDue: string | null
  maxDue: string | null
  archivedAt: Date | null
  photosCleanedAt: Date | null
}

export function HistoryList({ batches }: { batches: BatchSummary[] }) {
  const router = useRouter()
  const [, start] = useTransition()

  function handleDelete(batch: BatchSummary, e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    const label = batch.itemCount > 0
      ? `이 batch와 ${batch.itemCount}개 항목을 삭제할까요?`
      : '이 batch를 삭제할까요?'
    if (!window.confirm(label)) return
    start(async () => {
      await deleteBatch(batch.id)
      router.refresh()
    })
  }

  return (
    <div className="space-y-2">
      {batches.map((b) => (
        <BatchCard key={b.id} batch={b} onDelete={(e) => handleDelete(b, e)} />
      ))}
    </div>
  )
}
