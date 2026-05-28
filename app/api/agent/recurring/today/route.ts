import { NextResponse } from 'next/server'
import { listTodayRecurring, listThisWeekRecurring } from '@/server/actions/recurring'
import { checkAgentAuth } from '../../_auth'

/**
 * GET /api/agent/recurring/today
 *
 * 응답: 오늘의 매일 할 일 + 이번 주 매주 할 일.
 * 각각 doneAt 있으면 완료된 것.
 */
export async function GET(req: Request) {
  const auth = checkAgentAuth(req)
  if (auth) return auth

  const [dailyToday, weeklyThisWeek] = await Promise.all([
    listTodayRecurring(),
    listThisWeekRecurring(),
  ])

  return NextResponse.json({
    daily: dailyToday.map((r) => ({
      id: r.id,
      title: r.title,
      notes: r.notes,
      done: r.doneAt !== null,
    })),
    weekly: weeklyThisWeek.map((r) => ({
      id: r.id,
      title: r.title,
      notes: r.notes,
      done: r.doneAt !== null,
    })),
  })
}
