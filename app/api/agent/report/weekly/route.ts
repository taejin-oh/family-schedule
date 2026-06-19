import { NextResponse } from 'next/server'
import { getDb } from '@/server/db/client'
import { getSettings } from '@/server/actions/settings'
import { buildWeeklyReport } from '@/server/notifications/weekly-report'
import { sendTelegram } from '@/server/notifications/telegram'
import { mondayOfWeekIso, localDateIso } from '@/server/util/date'
import { checkAgentAuth } from '../../_auth'

/** POST /api/agent/report/weekly — 이번 주 리포트 생성 + 텔레그램 발송. */
export async function POST(req: Request) {
  const auth = checkAgentAuth(req)
  if (auth) return auth
  const db = getDb()
  const settings = await getSettings()
  const monday = mondayOfWeekIso(localDateIso())
  const sunday = (() => { const d = new Date(monday + 'T00:00:00'); d.setDate(d.getDate() + 6); return localDateIso(d) })()
  const r = await buildWeeklyReport(db, monday, sunday, { provider: settings.visionProvider, model: settings.visionModel })
  const sent = await sendTelegram(r.text)
  return NextResponse.json({ ok: true, weekStartIso: monday, weekEndIso: sunday, sent: sent.ok })
}
