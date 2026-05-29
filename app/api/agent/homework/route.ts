import { NextResponse } from 'next/server'
import { eq, isNull, and } from 'drizzle-orm'
import { createEmptyBatch, addDraftItem, commitBatch } from '@/server/actions/homework'
import { getDb } from '@/server/db/client'
import * as schema from '@/server/db/schema'
import { checkAgentAuth } from '../_auth'

/**
 * POST /api/agent/homework
 * Body: { academyId, title, dueDate?, notes?, actor? }
 *
 * batch 1개 생성 → 항목 draft 1개 추가 → commit.
 * commitBatch가 schedule rule + dueDate 정합성 검증을 담당.
 */
export async function POST(req: Request) {
  const auth = checkAgentAuth(req)
  if (auth) return auth

  let body: { academyId?: number; title?: string; dueDate?: string | null; notes?: string | null }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid json' }, { status: 400 })
  }

  const { academyId, title, dueDate, notes } = body
  // typeof 가드로 TS가 number로 narrow → 이하 non-null assertion 불필요.
  // 런타임 동작은 기존과 동일 (양수 정수만 통과).
  if (typeof academyId !== 'number' || !Number.isInteger(academyId) || academyId <= 0) {
    return NextResponse.json({ ok: false, error: 'academyId required' }, { status: 400 })
  }
  if (!title || !title.trim()) {
    return NextResponse.json({ ok: false, error: 'title required' }, { status: 400 })
  }
  if (dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
    return NextResponse.json({ ok: false, error: 'dueDate must be YYYY-MM-DD' }, { status: 400 })
  }

  const db = getDb()
  const academy = db.select({
    id: schema.academies.id,
    archivedAt: schema.academies.archivedAt,
  }).from(schema.academies)
    .where(and(eq(schema.academies.id, academyId), isNull(schema.academies.archivedAt)))
    .get()
  if (!academy) {
    return NextResponse.json({ ok: false, error: 'academy not found or archived' }, { status: 400 })
  }

  const emptyBatch = await createEmptyBatch(academyId)
  if (!emptyBatch.ok) return NextResponse.json({ ok: false, error: emptyBatch.error }, { status: 500 })

  const draft = await addDraftItem(emptyBatch.data.batchId, {
    title: title.trim(),
    notes: notes?.trim() || null,
    dueDate: dueDate ?? null,
  })
  if (!draft.ok) return NextResponse.json({ ok: false, error: draft.error }, { status: 400 })

  const commit = await commitBatch(emptyBatch.data.batchId)
  if (!commit.ok) return NextResponse.json({ ok: false, error: commit.error }, { status: 400 })

  return NextResponse.json({ ok: true, id: draft.data.id, academyId, title: title.trim(), dueDate: dueDate ?? null })
}
