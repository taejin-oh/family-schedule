import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { getDb } from '@/server/db/client'
import * as schema from '@/server/db/schema'
import { updateAcademy } from '@/server/actions/academies'
import { checkAgentAuth } from '../../_auth'

/**
 * PATCH /api/agent/academies/:id
 *
 * 학원 정보 부분 수정. body의 필드만 patch, 나머지는 기존 값 유지.
 * scheduleRule을 보낼 땐 _전체 slots 배열_로 보내야 함 (slot별 patch X).
 *
 * Body (any subset):
 *   {
 *     name?: string,
 *     subject?: 'math'|'english'|'korean'|'art'|'music'|'pe'|'science'|'other',
 *     color?: '#RRGGBB',
 *     scheduleRule?: { slots: [{ day, start, end }] } | null,
 *     location?: string | null,
 *     notes?: string | null,
 *     extractionHint?: string | null,
 *   }
 *
 * 응답: { ok: true } | { ok: false, error }
 *
 * 일반적 흐름 (시간표 일부 수정):
 *   1) GET /api/agent/academies → 대상 학원 + 현재 scheduleRule 찾기
 *   2) 클라이언트가 slots 배열을 수정
 *   3) PATCH /api/agent/academies/:id with { scheduleRule: { slots: [...] } }
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = checkAgentAuth(req)
  if (auth) return auth

  const { id: idStr } = await params
  const id = Number(idStr)
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ ok: false, error: 'invalid id' }, { status: 400 })
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid json' }, { status: 400 })
  }
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ ok: false, error: 'body must be object' }, { status: 400 })
  }

  const db = getDb()
  const current = db.select().from(schema.academies).where(eq(schema.academies.id, id)).get()
  if (!current) {
    return NextResponse.json({ ok: false, error: 'academy not found' }, { status: 404 })
  }
  if (current.archivedAt !== null) {
    return NextResponse.json({ ok: false, error: 'archived academy cannot be updated' }, { status: 409 })
  }

  // Merge: 보낸 필드만 overlay, 나머지는 current value.
  const merged = {
    name: typeof body.name === 'string' ? body.name : current.name,
    subject: typeof body.subject === 'string' ? body.subject : current.subject,
    color: typeof body.color === 'string' ? body.color : current.color,
    scheduleRule: 'scheduleRule' in body
      ? (body.scheduleRule as typeof current.scheduleRule)
      : current.scheduleRule,
    location: 'location' in body
      ? (body.location === null ? null : String(body.location))
      : current.location,
    notes: 'notes' in body
      ? (body.notes === null ? null : String(body.notes))
      : current.notes,
    extractionHint: 'extractionHint' in body
      ? (body.extractionHint === null ? null : String(body.extractionHint))
      : current.extractionHint,
  }

  // Delegate to the existing server action (zod validation included).
  const res = await updateAcademy(id, merged as Parameters<typeof updateAcademy>[1])
  if (!res.ok) {
    return NextResponse.json({ ok: false, error: res.error }, { status: 400 })
  }
  return NextResponse.json({ ok: true, id })
}
