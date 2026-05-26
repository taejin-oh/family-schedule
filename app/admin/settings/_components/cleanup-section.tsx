'use client'

import { useState, useTransition } from 'react'
import type { CleanupStats } from '@/server/actions/cleanup'

type CleanupResult = {
  archivedBatchIds: number[]
  photosCleanedBatchIds: number[]
  deletedFailedBatchIds: number[]
  deletedPhotoFiles: number
  deletedPhotoRows: number
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

  const totalPending =
    stats.pendingArchive + stats.pendingPhotoDelete + stats.pendingFailedDelete

  function handleClick() {
    if (pending) return
    const msg = totalPending === 0
      ? '정리 대상이 현재 없어요. 그래도 실행할까요?'
      : `정리 대상 ${totalPending}건을 실행합니다.\n` +
        `· 보관 처리 ${stats.pendingArchive}건\n` +
        `· 사진 삭제 ${stats.pendingPhotoDelete}건\n` +
        `· 실패/대기 삭제 ${stats.pendingFailedDelete}건\n\n계속할까요?`
    if (!confirm(msg)) return
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
        disabled={pending}
        onClick={handleClick}
        className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold py-2.5 rounded-lg transition-colors"
      >
        {pending ? '정리 중…' : '오래된 업로드 정리'}
      </button>

      {result && (
        <div className="text-xs bg-blue-50 text-blue-900 p-3 rounded-lg space-y-0.5">
          <div className="font-semibold">✓ 정리 완료</div>
          <div>· 보관 처리: {result.archivedBatchIds.length}건</div>
          <div>· 사진 정리: {result.photosCleanedBatchIds.length}건 (파일 {result.deletedPhotoFiles}개)</div>
          <div>· 실패/대기 삭제: {result.deletedFailedBatchIds.length}건</div>
        </div>
      )}
    </div>
  )
}
