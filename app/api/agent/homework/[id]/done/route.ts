import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { toggleItemDone } from '@/server/actions/homework'
import { getDb } from '@/server/db/client'
import * as schema from '@/server/db/schema'
import { checkAgentAuth } from '../../../_auth'

/**
 * POST /api/agent/homework/:id/done
 * Body (옵션): { actor?: { telegramId, name } }
 * 응답: { ok: true, id, title, doneAt } | { ok: false, error }
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = checkAgentAuth(req)
  if (auth) return auth

  const { id: idStr } = await ctx.params
  const id = Number(idStr)
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ ok: false, error: 'invalid id' }, { status: 400 })
  }

  const db = getDb()
  const item = db.select({
    id: schema.homeworkItems.id,
    title: schema.homeworkItems.title,
    isCommitted: schema.homeworkItems.isCommitted,
    doneAt: schema.homeworkItems.doneAt,
  }).from(schema.homeworkItems).where(eq(schema.homeworkItems.id, id)).get()

  if (!item) return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 })
  if (!item.isCommitted) return NextResponse.json({ ok: false, error: 'item not committed' }, { status: 409 })
  if (item.doneAt !== null) {
    return NextResponse.json({ ok: false, error: 'already done', doneAt: item.doneAt }, { status: 409 })
  }

  const res = await toggleItemDone(id, true)
  if (!res.ok) return NextResponse.json({ ok: false, error: res.error }, { status: 500 })

  const updated = db.select({ doneAt: schema.homeworkItems.doneAt })
    .from(schema.homeworkItems).where(eq(schema.homeworkItems.id, id)).get()

  return NextResponse.json({ ok: true, id, title: item.title, doneAt: updated?.doneAt })
}
