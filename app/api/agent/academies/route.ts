import { NextResponse } from 'next/server'
import { isNull } from 'drizzle-orm'
import { getDb } from '@/server/db/client'
import * as schema from '@/server/db/schema'
import { checkAgentAuth } from '../_auth'

/**
 * GET /api/agent/academies
 *
 * 응답: 보관 안 된 학원 목록 (id, name, subject, color, scheduleRule).
 * scheduleRule은 JSON: { slots: [{ day, start, end }, ...] }
 */
export async function GET(req: Request) {
  const auth = checkAgentAuth(req)
  if (auth) return auth

  const db = getDb()
  const rows = db.select({
    id: schema.academies.id,
    name: schema.academies.name,
    subject: schema.academies.subject,
    color: schema.academies.color,
    scheduleRule: schema.academies.scheduleRule,
    location: schema.academies.location,
    notes: schema.academies.notes,
  }).from(schema.academies)
    .where(isNull(schema.academies.archivedAt))
    .all()

  return NextResponse.json({
    count: rows.length,
    academies: rows,
  })
}
