import { NextResponse } from 'next/server'
import { deferHomework } from '@/server/actions/homework'
import { checkAgentAuth } from '../../../_auth'

/**
 * POST /api/agent/homework/:id/defer
 * Body: { dueDate: "YYYY-MM-DD" }
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = checkAgentAuth(req)
  if (auth) return auth

  const { id: idStr } = await ctx.params
  const id = Number(idStr)
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ ok: false, error: 'invalid id' }, { status: 400 })
  }

  let body: { dueDate?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid json' }, { status: 400 })
  }

  if (!body.dueDate || !/^\d{4}-\d{2}-\d{2}$/.test(body.dueDate)) {
    return NextResponse.json({ ok: false, error: 'dueDate must be YYYY-MM-DD' }, { status: 400 })
  }

  const res = await deferHomework(id, body.dueDate)
  if (!res.ok) return NextResponse.json({ ok: false, error: res.error }, { status: 500 })

  return NextResponse.json({ ok: true, id, dueDate: body.dueDate })
}
