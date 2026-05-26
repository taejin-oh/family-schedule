import { drizzle } from 'drizzle-orm/better-sqlite3'
import { eq, and, isNull, gte, lt, inArray } from 'drizzle-orm'
import * as schema from '@/server/db/schema'
import { localDateIso, localDayWindow, mondayOfWeekIso } from './date'

type AppDb = ReturnType<typeof drizzle<typeof schema>>

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const
type DayKey = (typeof DAY_KEYS)[number]

export type TodayEvaluation = {
  totalActive: number
  totalDone: number
  hadAny: boolean
  allDone: boolean
}

// Mirrors the "오늘 끝!" condition rendered by app/page.tsx so stamp eligibility
// matches what the kid sees.  hadAny+allDone => stamp eligible.
export function evaluateToday(db: AppDb): TodayEvaluation {
  const todayIso = localDateIso()
  const { start, end } = localDayWindow()

  const activeHw = db.select({ id: schema.homeworkItems.id, dueDate: schema.homeworkItems.dueDate })
    .from(schema.homeworkItems)
    .where(and(
      eq(schema.homeworkItems.isCommitted, true),
      isNull(schema.homeworkItems.doneAt),
    ))
    .all()
  const todayActiveHw = activeHw.filter((it) => it.dueDate !== null && it.dueDate <= todayIso).length

  const doneHwToday = db.select({ id: schema.homeworkItems.id })
    .from(schema.homeworkItems)
    .where(and(
      eq(schema.homeworkItems.isCommitted, true),
      gte(schema.homeworkItems.doneAt, start),
      lt(schema.homeworkItems.doneAt, end),
    ))
    .all().length

  const todayKey: DayKey = DAY_KEYS[new Date().getDay()]
  const dailyTasks = db.select().from(schema.recurringTasks)
    .where(and(isNull(schema.recurringTasks.archivedAt), eq(schema.recurringTasks.cadence, 'daily')))
    .all()
  const todayDaily = dailyTasks.filter((t) => Array.isArray(t.daysOfWeek) && (t.daysOfWeek as DayKey[]).includes(todayKey))
  const dailyCompletions = todayDaily.length === 0 ? [] : db.select()
    .from(schema.recurringTaskCompletions)
    .where(and(
      eq(schema.recurringTaskCompletions.completionDate, todayIso),
      inArray(schema.recurringTaskCompletions.taskId, todayDaily.map((t) => t.id)),
    ))
    .all()
  const dailyDoneIds = new Set(dailyCompletions.map((c) => c.taskId))
  const todayDailyActive = todayDaily.filter((t) => !dailyDoneIds.has(t.id)).length
  const todayDailyDone = todayDaily.filter((t) => dailyDoneIds.has(t.id)).length

  const weekKey = mondayOfWeekIso(todayIso)
  const weeklyTasks = db.select().from(schema.recurringTasks)
    .where(and(isNull(schema.recurringTasks.archivedAt), eq(schema.recurringTasks.cadence, 'weekly')))
    .all()
  const weeklyCompletions = weeklyTasks.length === 0 ? [] : db.select()
    .from(schema.recurringTaskCompletions)
    .where(and(
      eq(schema.recurringTaskCompletions.completionDate, weekKey),
      inArray(schema.recurringTaskCompletions.taskId, weeklyTasks.map((t) => t.id)),
    ))
    .all()
  const weeklyDoneIds = new Set(weeklyCompletions.map((c) => c.taskId))
  const weeklyActive = weeklyTasks.filter((t) => !weeklyDoneIds.has(t.id)).length
  const weeklyDone = weeklyTasks.filter((t) => weeklyDoneIds.has(t.id)).length

  const totalActive = todayActiveHw + todayDailyActive + weeklyActive
  const totalDone = doneHwToday + todayDailyDone + weeklyDone
  return {
    totalActive,
    totalDone,
    hadAny: totalActive + totalDone > 0,
    allDone: totalActive === 0,
  }
}
