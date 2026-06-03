'use client'

import Link from 'next/link'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

export type BatchCardData = {
  id: number
  capturedAt: Date
  status: 'pending' | 'processing' | 'ready' | 'committed' | 'failed'
  isPdf: boolean
  photoCount: number
  firstPhotoName: string | null
  itemCount: number
  userHint: string | null
  minDue: string | null
  maxDue: string | null
  archivedAt: Date | null
  photosCleanedAt: Date | null
}

const STATUS_LABEL: Record<BatchCardData['status'], string> = {
  pending: '대기',
  processing: '처리중',
  ready: '리뷰 대기',
  committed: '확정됨',
  failed: '실패',
}

function formatDate(d: Date | null): string {
  if (!d) return ''
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${m}/${day} ${hh}:${mm}`
}

function mdLabel(iso: string): string {
  const [, m, d] = iso.split('-')
  return `${Number(m)}/${Number(d)}`
}

function dueRangeLabel(b: BatchCardData): string {
  if (b.minDue == null && b.maxDue == null) {
    return b.itemCount > 0 ? `기한 없음 · 항목 ${b.itemCount}` : ''
  }
  if (b.minDue && b.maxDue && b.minDue === b.maxDue) {
    return `${mdLabel(b.minDue)} 숙제 ${b.itemCount}건`
  }
  if (b.minDue && b.maxDue) {
    return `${mdLabel(b.minDue)} ~ ${mdLabel(b.maxDue)} 숙제 ${b.itemCount}건`
  }
  return `항목 ${b.itemCount}건`
}

const MS_PER_DAY = 86_400_000
const PHOTOS_DELETE_AFTER_DAYS = 90

function archiveLabel(b: BatchCardData): string | null {
  if (b.photosCleanedAt) {
    return `사진 삭제됨 · ${formatDate(b.photosCleanedAt)}`
  }
  if (b.archivedAt) {
    const remainMs = b.archivedAt.getTime() + PHOTOS_DELETE_AFTER_DAYS * MS_PER_DAY - Date.now()
    const days = Math.max(0, Math.ceil(remainMs / MS_PER_DAY))
    return `보관 중 · ${days}일 후 사진 삭제`
  }
  return null
}

export function BatchCard({
  batch,
  onDelete,
}: {
  batch: BatchCardData
  onDelete?: (e: React.MouseEvent) => void
}) {
  const arch = archiveLabel(batch)
  const due = dueRangeLabel(batch)

  return (
    <div className="relative group">
      <Link
        href={`/homework/upload?reuse=${batch.id}`}
        className="block p-3 pr-9 rounded-xl bg-muted hover:bg-accent transition-colors text-xs space-y-1"
        title="이 파일로 다시 분석"
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground tabular-nums text-[11px]">
            {formatDate(batch.capturedAt)}
          </span>
          <span
            className={cn(
              'px-2 py-0.5 rounded-full text-[10px] font-semibold shrink-0',
              batch.status === 'committed' && 'bg-green-100 text-green-700',
              batch.status === 'ready' && 'bg-blue-100 text-blue-700',
              batch.status === 'failed' && 'bg-red-100 text-red-700',
              (batch.status === 'pending' || batch.status === 'processing') && 'bg-muted-foreground/10 text-muted-foreground',
            )}
          >
            {STATUS_LABEL[batch.status]}
          </span>
        </div>
        {due && (
          <div className="text-foreground text-[13px] font-semibold">
            {due}
          </div>
        )}
        <div className="text-muted-foreground text-[11px] truncate" title={batch.firstPhotoName ?? undefined}>
          {batch.isPdf ? '📄' : '🖼️'}{' '}
          {batch.firstPhotoName
            ? <>{batch.firstPhotoName}{batch.photoCount > 1 && ` 외 ${batch.photoCount - 1}개`}</>
            : `파일 ${batch.photoCount}개`}
        </div>
        {batch.userHint && (
          <div className="text-muted-foreground line-clamp-1 italic">
            “{batch.userHint}”
          </div>
        )}
        {arch && (
          <div className="text-[11px] text-amber-700 mt-1">
            🗄️ {arch}
          </div>
        )}
      </Link>
      {onDelete && (
        <button
          type="button"
          onClick={onDelete}
          className="absolute top-2 right-2 w-7 h-7 flex items-center justify-center rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors opacity-60 group-hover:opacity-100"
          aria-label="삭제"
          title="삭제"
        >
          <X className="h-3.5 w-3.5" aria-hidden />
        </button>
      )}
    </div>
  )
}
