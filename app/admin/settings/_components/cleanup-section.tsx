'use client'

import { useState, useTransition } from 'react'
import type { CleanupStats } from '@/server/actions/cleanup'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet'
import { useMediaQuery } from '@/lib/use-media-query'

type CleanupResult = {
  archivedBatchIds: number[]
  photosCleanedBatchIds: number[]
  deletedFailedBatchIds: number[]
  deletedPhotoFiles: number
  deletedPhotoRows: number
}

function formatRelativeTime(ms: number): string {
  const diff = Date.now() - ms
  const minutes = Math.floor(diff / 60_000)
  const hours = Math.floor(diff / 3_600_000)
  const days = Math.floor(diff / 86_400_000)
  if (days >= 1) return `${days}일 전`
  if (hours >= 1) return `${hours}시간 전`
  if (minutes >= 1) return `${minutes}분 전`
  return '방금 전'
}

export function CleanupSection({
  stats,
  onRun,
}: {
  stats: CleanupStats
  onRun: () => Promise<CleanupResult>
}) {
  const [pending, start] = useTransition()
  const [result, setResult] = useState<CleanupResult | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const totalPending =
    stats.pendingArchive + stats.pendingPhotoDelete + stats.pendingFailedDelete
  const buttonLabel = totalPending > 0
    ? `${totalPending}건 정리`
    : '정리 실행'

  function handleClick() {
    if (pending) return
    setConfirmOpen(true)
  }

  function handleConfirm() {
    setConfirmOpen(false)
    start(async () => {
      const r = await onRun()
      setResult(r)
    })
  }

  return (
    <div className="space-y-3">
      <ul className="text-xs text-muted-foreground space-y-1">
        <li>· 전체 batch: <span className="font-medium text-foreground">{stats.totalBatches}</span></li>
        <li>· 보관 상태 (사진 보존 중): <span className="font-medium text-foreground">{stats.archivedBatches}</span></li>
        <li>· 사진 정리됨: <span className="font-medium text-foreground">{stats.photosCleanedBatches}</span></li>
      </ul>

      <div className="border-t pt-3 space-y-1.5">
        <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">정리 대상</div>
        <ul className="text-xs space-y-1">
          <li>보관 처리 후보 (committed + 1주 경과 done): <span className="font-bold tabular-nums">{stats.pendingArchive}</span></li>
          <li>사진 삭제 후보 (보관 90일 경과): <span className="font-bold tabular-nums">{stats.pendingPhotoDelete}</span></li>
          <li>실패/대기 batch 삭제 (7일 경과): <span className="font-bold tabular-nums">{stats.pendingFailedDelete}</span></li>
        </ul>
      </div>

      <button
        type="button"
        disabled={pending || totalPending === 0}
        onClick={handleClick}
        className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-lg transition-colors"
      >
        {pending ? '정리 중…' : totalPending === 0 ? '정리할 항목이 없습니다' : buttonLabel}
      </button>

      {stats.lastRunAt !== null && (
        <p className="text-[11px] text-muted-foreground text-center">
          마지막 정리: {formatRelativeTime(stats.lastRunAt)}
        </p>
      )}

      {result && (
        <div className="text-xs bg-blue-50 text-blue-900 p-3 rounded-lg space-y-0.5">
          <div className="font-semibold">✓ 정리 완료</div>
          <div>· 보관 처리: {result.archivedBatchIds.length}건</div>
          <div>· 사진 정리: {result.photosCleanedBatchIds.length}건 (파일 {result.deletedPhotoFiles}개)</div>
          <div>· 실패/대기 삭제: {result.deletedFailedBatchIds.length}건</div>
        </div>
      )}

      <ConfirmModal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={handleConfirm}
        stats={stats}
        totalPending={totalPending}
      />
    </div>
  )
}

function ConfirmBody({
  stats,
  totalPending,
  onConfirm,
  onClose,
}: {
  stats: CleanupStats
  totalPending: number
  onConfirm: () => void
  onClose: () => void
}) {
  return (
    <div className="space-y-4">
      <div className="text-sm text-muted-foreground">
        아래 항목들을 정리합니다. <strong className="text-foreground">사진은 영구 삭제</strong>되며 되돌릴 수 없습니다.
      </div>
      <ul className="text-sm space-y-1.5 bg-muted/50 rounded-md p-3">
        <li className="flex justify-between">
          <span>보관 처리</span>
          <span className="font-bold tabular-nums">{stats.pendingArchive}건</span>
        </li>
        <li className="flex justify-between">
          <span>사진 영구 삭제</span>
          <span className={stats.pendingPhotoDelete > 0 ? 'font-bold tabular-nums text-destructive' : 'font-bold tabular-nums'}>
            {stats.pendingPhotoDelete}건
          </span>
        </li>
        <li className="flex justify-between">
          <span>실패/대기 batch 삭제</span>
          <span className="font-bold tabular-nums">{stats.pendingFailedDelete}건</span>
        </li>
      </ul>
      <div className="flex gap-2 pt-1">
        <Button variant="outline" className="flex-1" onClick={onClose} autoFocus>
          취소
        </Button>
        <Button
          variant="destructive"
          className="flex-1"
          onClick={onConfirm}
        >
          {totalPending}건 정리
        </Button>
      </div>
    </div>
  )
}

function ConfirmModal({
  open,
  onClose,
  onConfirm,
  stats,
  totalPending,
}: {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  stats: CleanupStats
  totalPending: number
}) {
  const isDesktop = useMediaQuery('(hover: hover)')

  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>업로드 정리 실행</DialogTitle>
          </DialogHeader>
          <ConfirmBody
            stats={stats}
            totalPending={totalPending}
            onConfirm={onConfirm}
            onClose={onClose}
          />
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>업로드 정리 실행</SheetTitle>
        </SheetHeader>
        <ConfirmBody
          stats={stats}
          totalPending={totalPending}
          onConfirm={onConfirm}
          onClose={onClose}
        />
      </SheetContent>
    </Sheet>
  )
}
