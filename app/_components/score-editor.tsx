'use client'

import { useState } from 'react'
import { StarRating } from './star-rating'

/** 별점(0~5) + 선택 이유 인라인 에디터. 저장 로직은 onScore에 위임 — 숙제/할일 공용. */
export function ScoreEditor({
  score, reason, onScore,
}: {
  score: number | null
  reason: string | null
  onScore: (score: number | null, reason: string | null) => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(reason ?? '')
  const [pending, setPending] = useState(false)

  async function set(v: number | null) {
    setPending(true)
    await onScore(v, v === null ? null : (draft.trim() || null))
    setPending(false)
  }
  async function saveReason() {
    if (score === null) return
    await onScore(score, draft.trim() || null)
  }

  return (
    <div className="flex items-center gap-2 flex-wrap mt-1">
      <StarRating value={score} onChange={set} disabled={pending} />
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
