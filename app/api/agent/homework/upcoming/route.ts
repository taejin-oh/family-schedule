import { NextResponse } from 'next/server'
import { eq, and, isNull, gte, lte, inArray } from 'drizzle-orm'
import { getDb } from '@/server/db/client'
import * as schema from '@/server/db/schema'
import { localDateIso } from '@/server/util/date'
import { checkAgentAuth } from '../../_auth'

/**
 * GET /api/agent/homework/upcoming?days=7
 *
 * 응답: 오늘부터 N일 안에 마감인 미완료 숙제 (today, tomorrow 포함).
 * days 기본 7. 1~30 범위.
 */
export async function GET(req: Request) {
  const auth = checkAgentAuth(req)
  if (auth) return auth

  const url = new URL(req.url)
  const daysParam = Number(url.searchParams.get('days') ?? '7')
  const days = Number.isFinite(daysParam) ? Math.min(30, Math.max(1, daysParam)) : 7

  const todayIso = localDateIso()
  const end = new Date(todayIso + 'T00:00:00')
  end.setDate(end.getDate() + days)
  const endIso = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`

  const db = getDb()
  const items = db.select({
    id: schema.homeworkItems.id,
    title: schema.homeworkItems.title,
    notes: schema.homeworkItems.notes,
    dueDate: schema.homeworkItems.dueDate,
    academyId: schema.homeworkItems.academyId,
  }).from(schema.homeworkItems)
    .where(and(
      eq(schema.homeworkItems.isCommitted, true),
      isNull(schema.homeworkItems.doneAt),
      gte(schema.homeworkItems.dueDate, todayIso),
      lte(schema.homeworkItems.dueDate, endIso),
    ))
    .all()

  const academyIds = [...new Set(items.map((i) => i.academyId))]
  const academyMap = academyIds.length === 0
    ? new Map()
    : new Map(
        db.select({ id: schema.academies.id, name: schema.academies.name })
          .from(schema.academies)
          .where(inArray(schema.academies.id, academyIds))
          .all()
          .map((a) => [a.id, a.name]),
      )

  // dueDate 그룹화
  const byDate = new Map<string, typeof items>()
  for (const it of items) {
    if (!it.dueDate) continue
    if (!byDate.has(it.dueDate)) byDate.set(it.dueDate, [])
    byDate.get(it.dueDate)!.push(it)
  }
  const dates = [...byDate.keys()].sort()

  return NextResponse.json({
    todayIso,
    endIso,
    days,
    count: items.length,
    byDate: dates.map((d) => ({
      date: d,
      items: byDate.get(d)!.map((it) => ({
        id: it.id,
        title: it.title,
        notes: it.notes,
        academy: academyMap.get(it.academyId) ?? null,
      })),
    })),
  })
}
