'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { setHomeworkScore } from '@/server/actions/homework'
import { StarRating } from './star-rating'

/** 완료 행 인라인 별점(0~5) + 선택 이유. (이름은 유지 — 호출부 동일.) */
export function ScoreChips({
  id, score, reason,
}: {
  id: number
  score: number | null
  reason: string | null
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(reason ?? '')
  const [pending, setPending] = useState(false)

  async function setScore(v: number | null) {
    setPending(true)
    await setHomeworkScore(id, v, v === null ? null : (draft.trim() || null))
    setPending(false)
    router.refresh()
  }
  async function saveReason() {
    if (score === null) return
    await setHomeworkScore(id, score, draft.trim() || null)
    router.refresh()
  }

  return (
    <div className="flex items-center gap-2 flex-wrap mt-1">
      <StarRating value={score} onChange={setScore} disabled={pending} />
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
      >
        이유
      </button>
      {open && (
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={saveReason}
          placeholder="이유(선택)"
          className="text-xs px-2 py-1 rounded border bg-background w-44"
        />
      )}
    </div>
  )
}
