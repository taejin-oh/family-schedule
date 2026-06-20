'use client'

import { useRouter } from 'next/navigation'
import { setHomeworkScore } from '@/server/actions/homework'
import { setRecurringScore } from '@/server/actions/recurring'
import { ScoreEditor } from './score-editor'

/** 숙제 완료 행 인라인 별점(0~5) + 선택 이유. (이름은 유지 — 호출부 동일.) */
export function ScoreChips({
  id, score, reason,
}: {
  id: number
  score: number | null
  reason: string | null
}) {
  const router = useRouter()
  return (
    <ScoreEditor
      score={score}
      reason={reason}
      onScore={async (v, r) => {
        await setHomeworkScore(id, v, r)
        router.refresh()
      }}
    />
  )
}

/** 매일/매주 할일 완료 행 인라인 별점(0~5) + 선택 이유. */
export function RecurringScoreChips({
  taskId, dateIso, score, reason,
}: {
  taskId: number
  dateIso: string
  score: number | null
  reason: string | null
}) {
  const router = useRouter()
  return (
    <ScoreEditor
      score={score}
      reason={reason}
      onScore={async (v, r) => {
        await setRecurringScore(taskId, dateIso, v, r)
        router.refresh()
      }}
    />
  )
}
