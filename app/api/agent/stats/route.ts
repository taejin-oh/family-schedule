import { NextResponse } from 'next/server'
import { eq, and, isNull, lte } from 'drizzle-orm'
import { getDb } from '@/server/db/client'
import * as schema from '@/server/db/schema'
import { localDateIso } from '@/server/util/date'
import { checkAgentAuth } from '../_auth'

/**
 * GET /api/agent/stats?scope=open|today|this-week
 *
 * 학원별 + 과목별 미완료 집계.
 * - open: 전체 미완료 (default)
 * - today: dueDate ≤ today+1 (사용자 정의 "오늘=내일까지")
 * - this-week: dueDate ≤ 이번 주 일요일
 */
export async function GET(req: Request) {
  const auth = checkAgentAuth(req)
  if (auth) return auth

  const url = new URL(req.url)
  const scope = (url.searchParams.get('scope') ?? 'open') as 'open' | 'today' | 'this-week'
  if (!['open', 'today', 'this-week'].includes(scope)) {
    return NextResponse.json({ error: 'invalid scope' }, { status: 400 })
  }

  const todayIso = localDateIso()
  const today = new Date(todayIso + 'T00:00:00')

  // 범위 끝 ISO
  let endIso: string | null = null
  if (scope === 'today') {
    const t = new Date(today); t.setDate(t.getDate() + 1)
    endIso = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`
  } else if (scope === 'this-week') {
    const dow = today.getDay()  // 0=Sun..6=Sat
    const daysUntilSun = (7 - dow) % 7
    const e = new Date(today); e.setDate(e.getDate() + daysUntilSun)
    endIso = `${e.getFullYear()}-${String(e.getMonth() + 1).padStart(2, '0')}-${String(e.getDate()).padStart(2, '0')}`
  }

  const db = getDb()

  // 미완료 committed items
  const baseConditions = [
    eq(schema.homeworkItems.isCommitted, true),
    isNull(schema.homeworkItems.doneAt),
  ]
  if (endIso) {
    baseConditions.push(lte(schema.homeworkItems.dueDate, endIso))
  }

  const items = db.select({
    id: schema.homeworkItems.id,
    academyId: schema.homeworkItems.academyId,
    dueDate: schema.homeworkItems.dueDate,
  }).from(schema.homeworkItems).where(and(...baseConditions)).all()

  // overdue: dueDate < today
  const overdueByAcademy = new Map<number, number>()
  for (const it of items) {
    if (it.dueDate && it.dueDate < todayIso) {
      overdueByAcademy.set(it.academyId, (overdueByAcademy.get(it.academyId) ?? 0) + 1)
    }
  }

  // 학원별 카운트
  const countByAcademy = new Map<number, number>()
  for (const it of items) {
    countByAcademy.set(it.academyId, (countByAcademy.get(it.academyId) ?? 0) + 1)
  }

  // 학원 메타데이터
  const academies = db.select({
    id: schema.academies.id,
    name: schema.academies.name,
    subject: schema.academies.subject,
    color: schema.academies.color,
  }).from(schema.academies)
    .where(isNull(schema.academies.archivedAt))
    .all()

  const academyMap = new Map(academies.map((a) => [a.id, a]))
  const byAcademy = [...countByAcademy.entries()]
    .map(([academyId, openCount]) => {
      const a = academyMap.get(academyId)
      return {
        academyId,
        name: a?.name ?? '(archived)',
        subject: a?.subject ?? null,
        color: a?.color ?? null,
        openCount,
        overdue: overdueByAcademy.get(academyId) ?? 0,
      }
    })
    .sort((x, y) => y.openCount - x.openCount)

  // 과목별 카운트
  const countBySubject = new Map<string, number>()
  for (const it of items) {
    const subject = academyMap.get(it.academyId)?.subject ?? 'other'
    countBySubject.set(subject, (countBySubject.get(subject) ?? 0) + 1)
  }
  const bySubject = [...countBySubject.entries()]
    .map(([subject, openCount]) => ({ subject, openCount }))
    .sort((x, y) => y.openCount - x.openCount)

  return NextResponse.json({
    scope,
    todayIso,
    endIso,
    totals: {
      items: items.length,
      academies: countByAcademy.size,
    },
    byAcademy,
    bySubject,
  })
}
