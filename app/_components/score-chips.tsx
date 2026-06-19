'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { setHomeworkScore, type HomeworkScore } from '@/server/actions/homework'
import { cn } from '@/lib/utils'

const SCORES: HomeworkScore[] = ['상', '중', '하']

export function ScoreChips({
  id, score, reason,
}: {
  id: number
  score: HomeworkScore | null
  reason: string | null
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(reason ?? '')
  const [pending, setPending] = useState(false)

  async function pick(s: HomeworkScore) {
    const next = score === s ? null : s
    setPending(true)
    await setHomeworkScore(id, next, next === null ? null : (draft.trim() || null))
    setPending(false)
    router.refresh()
  }
  async function saveReason() {
    if (!score) return
    await setHomeworkScore(id, score, draft.trim() || null)
    router.refresh()
  }

  return (
    <div className="flex items-center gap-1.5 flex-wrap mt-1">
      {SCORES.map((s) => (
        <button
          key={s}
          type="button"
          disabled={pending}
          onClick={() => pick(s)}
          aria-pressed={score === s}
          className={cn(
            'px-2 py-0.5 rounded-full text-xs border font-medium transition-colors',
            score === s
              ? 'bg-brand text-brand-foreground border-brand'
              : 'bg-muted text-muted-foreground border-foreground/10 hover:border-foreground/30',
          )}
        >
          {s}
        </button>
      ))}
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
