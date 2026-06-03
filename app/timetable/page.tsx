import { and, eq, gte, lt } from 'drizzle-orm'
import { listAcademies } from '@/server/actions/academies'
import { getDb } from '@/server/db/client'
import * as schema from '@/server/db/schema'
import { localDateIso } from '@/server/util/date'
import { Timetable } from './timetable'

function getWeekBounds() {
  const today = new Date()
  const dayOfWeek = today.getDay() // 0=Sun..6=Sat
  const daysSinceMonday = (dayOfWeek + 6) % 7
  const monday = new Date(today)
  monday.setDate(today.getDate() - daysSinceMonday)
  monday.setHours(0, 0, 0, 0)
  const nextMonday = new Date(monday)
  nextMonday.setDate(monday.getDate() + 7)
  return {
    mondayIso: localDateIso(monday),
    nextMondayIso: localDateIso(nextMonday),
    monday,
  }
}

// "오늘" 열 강조 + 이번 주 범위가 new Date()에 의존. 정적 프리렌더되면 빌드 날짜로
// 고정되므로 force-dynamic으로 매 요청 현재 날짜 기준 재렌더.
export const dynamic = 'force-dynamic'

export default async function TimetablePage() {
  const academies = await listAcademies()
  const { mondayIso, nextMondayIso, monday } = getWeekBounds()

  // Per-academy weekly homework progress (committed items whose due_date is in [Mon, next Mon))
  const weekItems = getDb()
    .select({
      academyId: schema.homeworkItems.academyId,
      dueDate: schema.homeworkItems.dueDate,
      doneAt: schema.homeworkItems.doneAt,
    })
    .from(schema.homeworkItems)
    .where(
      and(
        eq(schema.homeworkItems.isCommitted, true),
        gte(schema.homeworkItems.dueDate, mondayIso),
        lt(schema.homeworkItems.dueDate, nextMondayIso),
      ),
    )
    .all()

  // Per-academy whole-week totals
  const progressMap = new Map<number, { total: number; done: number }>()
  // Per-(academy, date) — used for the per-slot count badge on the grid
  const slotProgressMap = new Map<string, { total: number; done: number }>()
  for (const it of weekItems) {
    const cur = progressMap.get(it.academyId) ?? { total: 0, done: 0 }
    cur.total += 1
    if (it.doneAt !== null) cur.done += 1
    progressMap.set(it.academyId, cur)

    if (it.dueDate) {
      const key = `${it.academyId}|${it.dueDate}`
      const c = slotProgressMap.get(key) ?? { total: 0, done: 0 }
      c.total += 1
      if (it.doneAt !== null) c.done += 1
      slotProgressMap.set(key, c)
    }
  }

  const weeklyProgress = academies
    .map((a) => {
      const p = progressMap.get(a.id)
      if (!p) return null
      return {
        academyId: a.id,
        name: a.name,
        color: a.color,
        total: p.total,
        done: p.done,
      }
    })
    .filter((x): x is { academyId: number; name: string; color: string; total: number; done: number } => x !== null)

  // Convert per-(academy, dueDate) map into a plain object for the client
  const slotProgress: Record<string, { total: number; done: number }> = {}
  for (const [k, v] of slotProgressMap) slotProgress[k] = v

  return (
    <Timetable
      academies={academies}
      weeklyProgress={weeklyProgress}
      weekStart={monday}
      slotProgress={slotProgress}
    />
  )
}
