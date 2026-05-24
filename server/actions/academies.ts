import 'server-only'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { eq, isNotNull, isNull, asc, desc } from 'drizzle-orm'
import { z } from 'zod'
import * as schema from '@/server/db/schema'
import { getDb } from '@/server/db/client'

type AppDb = ReturnType<typeof drizzle<typeof schema>>
type Ctx = { db?: AppDb }
type Result<T = void> = { ok: true; data?: T } | { ok: false; error: string }

const InputSchema = z.object({
  name: z.string().min(1, '학원 이름이 필요합니다'),
  subject: z.enum(['math','english','korean','art','music','pe','science','other']),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, '색상은 #RRGGBB 형식'),
  scheduleRule: z.union([
    z.object({
      slots: z.array(z.object({
        day: z.enum(['mon','tue','wed','thu','fri','sat','sun']),
        start: z.string().regex(/^\d{2}:\d{2}$/, '시간 형식은 HH:MM'),
        end: z.string().regex(/^\d{2}:\d{2}$/, '시간 형식은 HH:MM'),
      })).min(1, '요일을 하나 이상 선택해주세요'),
    }),
    z.null(),
  ]),
  location: z.string().nullable(),
  notes: z.string().nullable(),
  extractionHint: z.string().nullable().optional(),
})

export type AcademyInput = z.infer<typeof InputSchema>

export async function createAcademy(input: AcademyInput, ctx: Ctx = {}): Promise<Result<{ id: number }>> {
  const parsed = InputSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'invalid input' }
  const db = ctx.db ?? getDb()
  const [row] = db.insert(schema.academies).values(parsed.data).returning({ id: schema.academies.id }).all()
  return { ok: true, data: { id: row.id } }
}

export async function updateAcademy(id: number, input: AcademyInput, ctx: Ctx = {}): Promise<Result> {
  const parsed = InputSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'invalid input' }
  const db = ctx.db ?? getDb()
  db.update(schema.academies).set(parsed.data).where(eq(schema.academies.id, id)).run()
  return { ok: true }
}

export async function archiveAcademy(id: number, ctx: Ctx = {}): Promise<Result> {
  const db = ctx.db ?? getDb()
  db.update(schema.academies).set({ archivedAt: new Date() }).where(eq(schema.academies.id, id)).run()
  return { ok: true }
}

export async function listAcademies(ctx: Ctx = {}) {
  const db = ctx.db ?? getDb()
  return db.select().from(schema.academies).where(isNull(schema.academies.archivedAt)).orderBy(asc(schema.academies.id)).all()
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
  return { ok: true }
}
