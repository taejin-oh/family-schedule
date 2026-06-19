'use server'
import { revalidatePath } from 'next/cache'
import { getDb } from '@/server/db/client'
import { getSettings } from '@/server/actions/settings'
import { buildWeeklyReport } from '@/server/notifications/weekly-report'
import { mondayOfWeekIso, localDateIso } from '@/server/util/date'

export async function regenerateThisWeekReport() {
  const db = getDb()
  const settings = await getSettings()
  const today = localDateIso()
  const monday = mondayOfWeekIso(today)
  const sunday = (() => { const d = new Date(monday + 'T00:00:00'); d.setDate(d.getDate() + 6); return localDateIso(d) })()
  await buildWeeklyReport(db, monday, sunday, { provider: settings.visionProvider, model: settings.visionModel })
  revalidatePath('/report')
}
