import 'server-only'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { eq, isNotNull, isNull, asc, desc, and, gte, lt } from 'drizzle-orm'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import * as schema from '@/server/db/schema'
import { getDb } from '@/server/db/client'
import { isValidScheduleTime, isValidTimeRange } from '@/lib/time-slots'
import { localDateIso } from '@/server/util/date'
import { logServerEvent } from '@/server/log/server-event'

function revalidateAcademyPages() {
  revalidatePath('/')
  revalidatePath('/dashboard')
  revalidatePath('/academies', 'layout')
  revalidatePath('/timetable')
}

type AppDb = ReturnType<typeof drizzle<typeof schema>>
type Ctx = { db?: AppDb }
type Result<T = void> = { ok: true; data?: T } | { ok: false; error: string }

const InputSchema = z.object({
  name: z.string().min(1, '학원 이름이 필요합니다').max(100, '학원 이름이 너무 깁니다'),
  subject: z.enum(['math','english','korean','art','music','pe','science','other']),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, '색상은 #RRGGBB 형식'),
  scheduleRule: z.union([
    z.object({
      slots: z.array(
        z.object({
          day: z.enum(['mon','tue','wed','thu','fri','sat','sun']),
          start: z.string().refine(isValidScheduleTime, '시간은 00:00-24:00 형식이어야 합니다'),
          end: z.string().refine(isValidScheduleTime, '시간은 00:00-24:00 형식이어야 합니다'),
        }).superRefine((slot, ctx) => {
          if (!isValidTimeRange(slot.start, slot.end)) {
            ctx.addIssue({
              code: 'custom',
              path: ['end'],
              message: '종료 시간은 시작 시간보다 늦어야 합니다',
            })
          }
        }),
      ).min(1, '요일을 하나 이상 선택해주세요'),
    }),
    z.null(),
  ]),
  location: z.string().max(200, '위치 텍스트가 너무 깁니다').nullable(),
  notes: z.string().max(5000, '메모가 너무 깁니다').nullable(),
  extractionHint: z.string().max(5000, '추출 힌트가 너무 깁니다').nullable().optional(),
})

export type AcademyInput = z.infer<typeof InputSchema>

export async function createAcademy(input: AcademyInput, ctx: Ctx = {}): Promise<Result<{ id: number }>> {
  const parsed = InputSchema.safeParse(input)
  if (!parsed.success) {
    await logServerEvent({ category: 'error', event: 'validation_fail', props: { action: 'academy.create', issue: parsed.error.issues[0]?.message } })
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'invalid input' }
  }
  const db = ctx.db ?? getDb()
  const [row] = db.insert(schema.academies).values(parsed.data).returning({ id: schema.academies.id }).all()
  revalidateAcademyPages()
  await logServerEvent({ category: 'mutation', event: 'academy.create', props: { id: row.id, subject: parsed.data.subject, has_schedule: parsed.data.scheduleRule !== null, slot_count: parsed.data.scheduleRule?.slots.length ?? 0 } })
  return { ok: true, data: { id: row.id } }
}

export async function updateAcademy(id: number, input: AcademyInput, ctx: Ctx = {}): Promise<Result> {
  const parsed = InputSchema.safeParse(input)
  if (!parsed.success) {
    await logServerEvent({ category: 'error', event: 'validation_fail', props: { action: 'academy.update', id, issue: parsed.error.issues[0]?.message } })
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'invalid input' }
  }
  const db = ctx.db ?? getDb()
  db.update(schema.academies).set(parsed.data).where(eq(schema.academies.id, id)).run()
  revalidateAcademyPages()
  await logServerEvent({ category: 'mutation', event: 'academy.update', props: { id, subject: parsed.data.subject, slot_count: parsed.data.scheduleRule?.slots.length ?? 0 } })
  return { ok: true }
}

export async function archiveAcademy(id: number, ctx: Ctx = {}): Promise<Result> {
  const db = ctx.db ?? getDb()
  db.update(schema.academies).set({ archivedAt: new Date() }).where(eq(schema.academies.id, id)).run()
  revalidateAcademyPages()
  await logServerEvent({ category: 'mutation', event: 'academy.archive', props: { id } })
  return { ok: true }
}


export async function listAcademies(ctx: Ctx = {}) {
  const db = ctx.db ?? getDb()
  return db.select().from(schema.academies).where(isNull(schema.academies.archivedAt)).orderBy(asc(schema.academies.id)).all()
}

/**
 * 이번 주(월~다음 주 월 직전) committed 숙제의 학원별 진행도(done/total).
 * 가로 모드 학원 상세 좌측 레일의 진행 배지용. timetable과 동일 기준.
 */
export async function getWeeklyProgressMap(
  ctx: Ctx = {},
): Promise<Record<number, { total: number; done: number }>> {
  const db = ctx.db ?? getDb()
  const today = new Date()
  const daysSinceMonday = (today.getDay() + 6) % 7
  const monday = new Date(today)
  monday.setDate(today.getDate() - daysSinceMonday)
  monday.setHours(0, 0, 0, 0)
  const nextMonday = new Date(monday)
  nextMonday.setDate(monday.getDate() + 7)
  const mondayIso = localDateIso(monday)
  const nextMondayIso = localDateIso(nextMonday)

  const rows = db
    .select({
      academyId: schema.homeworkItems.academyId,
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

  const map: Record<number, { total: number; done: number }> = {}
  for (const r of rows) {
    const cur = (map[r.academyId] ??= { total: 0, done: 0 })
    cur.total += 1
    if (r.doneAt !== null) cur.done += 1
  }
  return map
}

/** Archived academies for the 보관함 page; newest archive first. */
export async function listArchivedAcademies(ctx: Ctx = {}) {
  const db = ctx.db ?? getDb()
  return db.select().from(schema.academies).where(isNotNull(schema.academies.archivedAt)).orderBy(desc(schema.academies.archivedAt)).all()
}

/** Restore an archived academy → archivedAt = null so it shows up everywhere again. */
export async function unarchiveAcademy(id: number, ctx: Ctx = {}): Promise<Result> {
  const db = ctx.db ?? getDb()
  db.update(schema.academies).set({ archivedAt: null }).where(eq(schema.academies.id, id)).run()
  revalidateAcademyPages()
  await logServerEvent({ category: 'mutation', event: 'academy.unarchive', props: { id } })
  return { ok: true }
}

/**
 * Permanent delete. CASCADES homework_batches (→ items + photos)
 * before deleting the academy row to satisfy FK constraints
 * (homework_batches.academy_id has no ON DELETE CASCADE).
 */
export async function deleteAcademyPermanently(id: number, ctx: Ctx = {}): Promise<Result> {
  const db = ctx.db ?? getDb()
  db.transaction((tx) => {
    // Deleting batches cascades to homework_items + homework_photos via the
    // ON DELETE CASCADE FKs on those tables.
    tx.delete(schema.homeworkBatches).where(eq(schema.homeworkBatches.academyId, id)).run()
    tx.delete(schema.academies).where(eq(schema.academies.id, id)).run()
  })
  revalidateAcademyPages()
  await logServerEvent({ category: 'mutation', event: 'academy.delete_permanent', props: { id } })
  return { ok: true }
}
