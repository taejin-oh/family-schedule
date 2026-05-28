import { NextResponse } from 'next/server'
import { markRecurringDone } from '@/server/actions/recurring'
import { localDateIso } from '@/server/util/date'
import { checkAgentAuth } from '../../../_auth'

/**
 * POST /api/agent/recurring/:id/done
 * Body (옵션): { dateIso?: "YYYY-MM-DD" }  — 미지정 시 오늘.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = checkAgentAuth(req)
  if (auth) return auth

  const { id: idStr } = await ctx.params
  const id = Number(idStr)
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ ok: false, error: 'invalid id' }, { status: 400 })
  }

  let body: { dateIso?: string } = {}
  try {
    body = await req.json()
  } catch {
    // body 없어도 OK — 오늘로
  }

  const dateIso = body.dateIso ?? localDateIso()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) {
    return NextResponse.json({ ok: false, error: 'dateIso must be YYYY-MM-DD' }, { status: 400 })
  }

  const res = await markRecurringDone(id, dateIso)
  if (!res.ok) return NextResponse.json({ ok: false, error: res.error }, { status: 500 })

  return NextResponse.json({ ok: true, id, dateIso })
}
