'use server'

import { revalidatePath } from 'next/cache'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { eq, isNull, asc, and } from 'drizzle-orm'
import { z } from 'zod'
import * as schema from '@/server/db/schema'
import { getDb } from '@/server/db/client'
import { localDateIso } from '@/server/util/date'

type AppDb = ReturnType<typeof drizzle<typeof schema>>
type Ctx = { db?: AppDb }
type Result<T = void> = { ok: true; data?: T } | { ok: false; error: string }

const TaskInput = z.object({
  title: z.string().min(1, '제목이 필요합니다'),
  notes: z.string().nullable().optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, '색상은 #RRGGBB').optional(),
  daysOfWeek: z.array(z.enum(['mon','tue','wed','thu','fri','sat','sun'])).min(1, '요일을 하나 이상 선택해주세요'),
})

export type RecurringTaskInput = z.infer<typeof TaskInput>

export async function listRecurringTasks(ctx: Ctx = {}) {
  const db = ctx.db ?? getDb()
  return db.select().from(schema.recurringTasks).where(isNull(schema.recurringTasks.archivedAt)).orderBy(asc(schema.recurringTasks.id)).all()
}

export async function createRecurringTask(input: RecurringTaskInput, ctx: Ctx = {}): Promise<Result<{ id: number }>> {
  const parsed = TaskInput.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'invalid input' }
  const db = ctx.db ?? getDb()
  const data = parsed.data
  const [row] = db.insert(schema.recurringTasks).values({
    title: data.title,
    notes: data.notes ?? null,
    color: data.color ?? '#64748b',
    daysOfWeek: data.daysOfWeek,
  }).returning({ id: schema.recurringTasks.id }).all()
  revalidatePath('/recurring')
  revalidatePath('/')
  return { ok: true, data: { id: row.id } }
}

export async function updateRecurringTask(id: number, input: RecurringTaskInput, ctx: Ctx = {}): Promise<Result> {
  const parsed = TaskInput.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'invalid input' }
  const db = ctx.db ?? getDb()
  const data = parsed.data
  db.update(schema.recurringTasks).set({
    title: data.title,
    notes: data.notes ?? null,
    color: data.color ?? '#64748b',
    daysOfWeek: data.daysOfWeek,
  }).where(eq(schema.recurringTasks.id, id)).run()
  revalidatePath('/recurring')
  revalidatePath('/')
  return { ok: true }
}

export async function archiveRecurringTask(id: number, ctx: Ctx = {}): Promise<Result> {
  const db = ctx.db ?? getDb()
  db.update(schema.recurringTasks).set({ archivedAt: new Date() }).where(eq(schema.recurringTasks.id, id)).run()
  revalidatePath('/recurring')
  revalidatePath('/')
  return { ok: true }
}

export async function markRecurringDone(taskId: number, dateIso: string, ctx: Ctx = {}): Promise<Result> {
  const db = ctx.db ?? getDb()
  // Check if already exists
  const existing = db.select()
    .from(schema.recurringTaskCompletions)
    .where(and(
      eq(schema.recurringTaskCompletions.taskId, taskId),
      eq(schema.recurringTaskCompletions.completionDate, dateIso),
    ))
    .get()
  if (!existing) {
    db.insert(schema.recurringTaskCompletions).values({
      taskId,
      completionDate: dateIso,
      doneAt: new Date(),
    }).run()
  }
  revalidatePath('/recurring')
  revalidatePath('/')
  return { ok: true }
}

export async function markRecurringUndone(taskId: number, dateIso: string, ctx: Ctx = {}): Promise<Result> {
  const db = ctx.db ?? getDb()
  db.delete(schema.recurringTaskCompletions)
    .where(and(
      eq(schema.recurringTaskCompletions.taskId, taskId),
      eq(schema.recurringTaskCompletions.completionDate, dateIso),
    ))
    .run()
  revalidatePath('/recurring')
  revalidatePath('/')
  return { ok: true }
}

const DAY_KEYS = ['sun','mon','tue','wed','thu','fri','sat'] as const
type DayKey = 'mon'|'tue'|'wed'|'thu'|'fri'|'sat'|'sun'

export async function listTodayRecurring(ctx: Ctx = {}) {
  const db = ctx.db ?? getDb()
  const todayKey: DayKey = DAY_KEYS[new Date().getDay()]
  const todayIso = localDateIso()

  const tasks = db.select().from(schema.recurringTasks).where(isNull(schema.recurringTasks.archivedAt)).orderBy(asc(schema.recurringTasks.id)).all()

  const todayTasks = tasks.filter((t) => {
    const days = t.daysOfWeek as DayKey[]
    return Array.isArray(days) && days.includes(todayKey)
  })

  // Fetch completions for today
  const completions = db.select()
    .from(schema.recurringTaskCompletions)
    .where(eq(schema.recurringTaskCompletions.completionDate, todayIso))
    .all()
  const doneMap = new Map(completions.map((c) => [c.taskId, c.doneAt]))

  return todayTasks.map((t) => ({
    id: t.id,
    title: t.title,
    notes: t.notes,
    color: t.color,
    daysOfWeek: t.daysOfWeek as DayKey[],
    doneAt: doneMap.get(t.id) ?? null,
  }))
}
