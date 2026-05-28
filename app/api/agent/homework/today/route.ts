import { NextResponse } from 'next/server'
import { eq, and, isNull, lte, inArray } from 'drizzle-orm'
import { getDb } from '@/server/db/client'
import * as schema from '@/server/db/schema'
import { localDateIso } from '@/server/util/date'
import { checkAgentAuth } from '../../_auth'

/**
 * GET /api/agent/homework/today
 *
 * 응답: 오늘 마감 + overdue 미완료 숙제 목록.
 * 사용자 정의 "오늘 = 내일까지 끝내야 하는 숙제"에 맞춰 dueDate <= today+1 포함.
 */
export async function GET(req: Request) {
  const auth = checkAgentAuth(req)
  if (auth) return auth

  const todayIso = localDateIso()
  const tomorrow = new Date(todayIso + 'T00:00:00')
  tomorrow.setDate(tomorrow.getDate() + 1)
  const tomorrowIso = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`

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
      lte(schema.homeworkItems.dueDate, tomorrowIso),
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

  return NextResponse.json({
    todayIso,
    tomorrowIso,
    count: items.length,
    items: items.map((it) => ({
      id: it.id,
      title: it.title,
      notes: it.notes,
      dueDate: it.dueDate,
      academy: academyMap.get(it.academyId) ?? null,
    })),
  })
}
