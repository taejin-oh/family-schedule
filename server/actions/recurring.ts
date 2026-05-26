'use server'

import { revalidatePath } from 'next/cache'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { eq, isNull, asc, and, inArray } from 'drizzle-orm'
import { z } from 'zod'
import * as schema from '@/server/db/schema'
import { getDb } from '@/server/db/client'
import { localDateIso, mondayOfWeekIso } from '@/server/util/date'
import { tryStampToday } from '@/server/actions/stickers'

type AppDb = ReturnType<typeof drizzle<typeof schema>>
type Ctx = { db?: AppDb }
type Result<T = void> = { ok: true; data?: T } | { ok: false; error: string }

const TaskInput = z.object({
  title: z.string().min(1, '제목이 필요합니다'),
  notes: z.string().nullable().optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, '색상은 #RRGGBB').optional(),
  cadence: z.enum(['daily', 'weekly']).default('daily'),
  daysOfWeek: z.array(z.enum(['mon','tue','wed','thu','fri','sat','sun'])).default([]),
}).superRefine((v, ctx) => {
  if (v.cadence === 'daily' && v.daysOfWeek.length === 0) {
    ctx.addIssue({ code: 'custom', path: ['daysOfWeek'], message: '요일을 하나 이상 선택해주세요' })
  }
})

// Pre-parse input type — cadence/notes/color/daysOfWeek can be omitted; zod
// fills defaults at runtime. Tests pass partial shapes.
export type RecurringTaskInput = z.input<typeof TaskInput>

function completionKey(cadence: 'daily'|'weekly', dateIso: string): string {
  return cadence === 'weekly' ? mondayOfWeekIso(dateIso) : dateIso
}

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
    cadence: data.cadence,
    daysOfWeek: data.daysOfWeek,
  }).returning({ id: schema.recurringTasks.id }).all()
  revalidatePath('/recurring')
  revalidatePath('/')
  revalidatePath('/dashboard')
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
    cadence: data.cadence,
    daysOfWeek: data.daysOfWeek,
  }).where(eq(schema.recurringTasks.id, id)).run()
  revalidatePath('/recurring')
  revalidatePath('/')
  revalidatePath('/dashboard')
  return { ok: true }
}

export async function archiveRecurringTask(id: number, ctx: Ctx = {}): Promise<Result> {
  const db = ctx.db ?? getDb()
  db.update(schema.recurringTasks).set({ archivedAt: new Date() }).where(eq(schema.recurringTasks.id, id)).run()
  revalidatePath('/recurring')
  revalidatePath('/')
  revalidatePath('/dashboard')
  return { ok: true }
}

export async function markRecurringDone(taskId: number, dateIso: string, ctx: Ctx = {}): Promise<Result> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) return { ok: false, error: '잘못된 날짜 형식' }
  const db = ctx.db ?? getDb()
  const task = db.select({ cadence: schema.recurringTasks.cadence }).from(schema.recurringTasks).where(eq(schema.recurringTasks.id, taskId)).get()
  if (!task) return { ok: false, error: 'task not found' }
  const key = completionKey(task.cadence, dateIso)
  const existing = db.select()
    .from(schema.recurringTaskCompletions)
    .where(and(
      eq(schema.recurringTaskCompletions.taskId, taskId),
      eq(schema.recurringTaskCompletions.completionDate, key),
    ))
    .get()
  if (!existing) {
    db.insert(schema.recurringTaskCompletions).values({
      taskId,
      completionDate: key,
      doneAt: new Date(),
    }).run()
  }
  await tryStampToday({ db })
  revalidatePath('/recurring')
  revalidatePath('/')
  revalidatePath('/dashboard')
  return { ok: true }
}

export async function markRecurringUndone(taskId: number, dateIso: string, ctx: Ctx = {}): Promise<Result> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) return { ok: false, error: '잘못된 날짜 형식' }
  const db = ctx.db ?? getDb()
  const task = db.select({ cadence: schema.recurringTasks.cadence }).from(schema.recurringTasks).where(eq(schema.recurringTasks.id, taskId)).get()
  if (!task) return { ok: false, error: 'task not found' }
  const key = completionKey(task.cadence, dateIso)
  db.delete(schema.recurringTaskCompletions)
    .where(and(
      eq(schema.recurringTaskCompletions.taskId, taskId),
      eq(schema.recurringTaskCompletions.completionDate, key),
    ))
    .run()
  await tryStampToday({ db })
  revalidatePath('/recurring')
  revalidatePath('/')
  revalidatePath('/dashboard')
  return { ok: true }
}

const DAY_KEYS = ['sun','mon','tue','wed','thu','fri','sat'] as const
type DayKey = 'mon'|'tue'|'wed'|'thu'|'fri'|'sat'|'sun'

export async function listDayRecurring(daysFromToday: number, ctx: Ctx = {}) {
  const db = ctx.db ?? getDb()
  const target = new Date()
  target.setDate(target.getDate() + daysFromToday)
  const targetKey: DayKey = DAY_KEYS[target.getDay()]
  const targetIso = localDateIso(target)

  const tasks = db.select().from(schema.recurringTasks)
    .where(and(isNull(schema.recurringTasks.archivedAt), eq(schema.recurringTasks.cadence, 'daily')))
    .orderBy(asc(schema.recurringTasks.id)).all()

  const dayTasks = tasks.filter((t) => {
    const days = t.daysOfWeek as DayKey[]
    return Array.isArray(days) && days.includes(targetKey)
  })

  const completions = dayTasks.length === 0 ? [] : db.select()
    .from(schema.recurringTaskCompletions)
    .where(and(
      eq(schema.recurringTaskCompletions.completionDate, targetIso),
      inArray(schema.recurringTaskCompletions.taskId, dayTasks.map((t) => t.id)),
    ))
    .all()
  const doneMap = new Map(completions.map((c) => [c.taskId, c.doneAt]))

  return dayTasks.map((t) => ({
    id: t.id,
    title: t.title,
    notes: t.notes,
    color: t.color,
    cadence: t.cadence,
    daysOfWeek: t.daysOfWeek as DayKey[],
    doneAt: doneMap.get(t.id) ?? null,
    targetDateIso: targetIso,
  }))
}

export async function listTodayRecurring(ctx: Ctx = {}) {
  return listDayRecurring(0, ctx)
}

export async function listThisWeekRecurring(ctx: Ctx = {}) {
  const db = ctx.db ?? getDb()
  const todayIso = localDateIso()
  const weekKey = mondayOfWeekIso(todayIso)

  const tasks = db.select().from(schema.recurringTasks)
    .where(and(isNull(schema.recurringTasks.archivedAt), eq(schema.recurringTasks.cadence, 'weekly')))
    .orderBy(asc(schema.recurringTasks.id)).all()

  const completions = tasks.length === 0 ? [] : db.select()
    .from(schema.recurringTaskCompletions)
    .where(and(
      eq(schema.recurringTaskCompletions.completionDate, weekKey),
      inArray(schema.recurringTaskCompletions.taskId, tasks.map((t) => t.id)),
    ))
    .all()
  const doneMap = new Map(completions.map((c) => [c.taskId, c.doneAt]))

  return tasks.map((t) => ({
    id: t.id,
    title: t.title,
    notes: t.notes,
    color: t.color,
    cadence: t.cadence,
    doneAt: doneMap.get(t.id) ?? null,
    weekStartIso: weekKey,
  }))
}
