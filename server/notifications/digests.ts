import { drizzle } from 'drizzle-orm/better-sqlite3'
import { and, eq, isNull, lt } from 'drizzle-orm'
import * as schema from '@/server/db/schema'

type AppDb = ReturnType<typeof drizzle<typeof schema>>

const DAY_KO = ['일', '월', '화', '수', '목', '금', '토']

/** Escape user-controlled strings for Telegram HTML parse_mode.
 *  Telegram requires &, <, > escaped; quotes are safe outside attribute context. */
function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function dayKo(dateIso: string): string {
  const [y, m, d] = dateIso.split('-').map(Number)
  const day = new Date(y, m - 1, d).getDay()
  return DAY_KO[day]
}

function nextDayIso(dateIso: string): string {
  const [y, m, d] = dateIso.split('-').map(Number)
  const next = new Date(y, m - 1, d + 1)
  const yy = next.getFullYear()
  const mm = String(next.getMonth() + 1).padStart(2, '0')
  const dd = String(next.getDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

/** 오늘(dateIso) 요일에 해당하는 학원 슬롯 목록 반환 */
function todayAcademySlots(db: AppDb, dateIso: string) {
  const [y, m, d] = dateIso.split('-').map(Number)
  const dayIndex = new Date(y, m - 1, d).getDay()
  const dayKeys: schema.Day[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
  const todayKey = dayKeys[dayIndex]

  const allAcademies = db.select().from(schema.academies)
    .where(isNull(schema.academies.archivedAt))
    .all()

  type SlotEntry = { name: string; start: string; end: string }
  const slots: SlotEntry[] = []
  for (const a of allAcademies) {
    if (!a.scheduleRule?.slots) continue
    for (const slot of a.scheduleRule.slots) {
      if (slot.day === todayKey) {
        slots.push({ name: a.name, start: slot.start, end: slot.end })
      }
    }
  }
  slots.sort((a, b) => a.start.localeCompare(b.start))
  return slots
}

/** 특정 날짜 마감 미완료 숙제 반환 */
function homeworkDueOn(db: AppDb, dateIso: string) {
  return db.select({
    id: schema.homeworkItems.id,
    title: schema.homeworkItems.title,
    notes: schema.homeworkItems.notes,
    academyId: schema.homeworkItems.academyId,
  }).from(schema.homeworkItems)
    .where(and(
      eq(schema.homeworkItems.isCommitted, true),
      isNull(schema.homeworkItems.doneAt),
      eq(schema.homeworkItems.dueDate, dateIso),
    ))
    .all()
}

/** 기한 지난 미완료 숙제 반환 (dueDate < dateIso) */
function homeworkOverdue(db: AppDb, dateIso: string) {
  return db.select({
    id: schema.homeworkItems.id,
    title: schema.homeworkItems.title,
    notes: schema.homeworkItems.notes,
    dueDate: schema.homeworkItems.dueDate,
    academyId: schema.homeworkItems.academyId,
  }).from(schema.homeworkItems)
    .where(and(
      eq(schema.homeworkItems.isCommitted, true),
      isNull(schema.homeworkItems.doneAt),
      lt(schema.homeworkItems.dueDate, dateIso),
    ))
    .all()
}

function getAcademyNames(db: AppDb): Map<number, string> {
  const rows = db.select({ id: schema.academies.id, name: schema.academies.name }).from(schema.academies).all()
  return new Map(rows.map((r) => [r.id, r.name]))
}

function diffDays(dueDateIso: string, todayIso: string): number {
  const [dy, dm, dd] = dueDateIso.split('-').map(Number)
  const [ty, tm, td] = todayIso.split('-').map(Number)
  const due = new Date(dy, dm - 1, dd)
  const today = new Date(ty, tm - 1, td)
  return Math.round((today.getTime() - due.getTime()) / 86400000)
}

/** 오늘 학원 + 오늘 마감 숙제 */
export function buildMorningDigest(db: AppDb, dateIso: string): string {
  const slots = todayAcademySlots(db, dateIso)
  const hw = homeworkDueOn(db, dateIso)
  const academyNames = getAcademyNames(db)

  const lines: string[] = []
  lines.push(`🌅 <b>${dateIso} (${dayKo(dateIso)})</b>`)
  lines.push('')

  lines.push('📚 오늘 학원')
  if (slots.length === 0) {
    lines.push('• 오늘 학원 없음')
  } else {
    for (const s of slots) {
      lines.push(`• ${esc(s.name)} ${s.start}–${s.end}`)
    }
  }
  lines.push('')

  lines.push('✅ 오늘 마감 숙제')
  if (hw.length === 0) {
    lines.push('• 오늘 마감 숙제 없음')
  } else {
    for (const h of hw) {
      const acName = academyNames.get(h.academyId) ?? '?'
      lines.push(`• [${esc(acName)}] ${esc(h.title)}`)
    }
  }

  return lines.join('\n')
}

/** 내일 마감 미완료 숙제 */
export function buildEveningDigest(db: AppDb, dateIso: string): string {
  const tomorrow = nextDayIso(dateIso)
  const hw = homeworkDueOn(db, tomorrow)
  const academyNames = getAcademyNames(db)

  const lines: string[] = []
  lines.push(`🌙 <b>내일(${tomorrow}) 마감 숙제</b>`)
  lines.push('')

  if (hw.length === 0) {
    lines.push('• 내일 마감 숙제 없음')
  } else {
    for (const h of hw) {
      const acName = academyNames.get(h.academyId) ?? '?'
      lines.push(`• [${esc(acName)}] ${esc(h.title)}`)
    }
  }

  return lines.join('\n')
}

/** 오늘 마감 미완료 + 기한 지난 미완료 */
export function buildMiddayDigest(db: AppDb, dateIso: string): string {
  const todayHw = homeworkDueOn(db, dateIso)
  const overdueHw = homeworkOverdue(db, dateIso)
  const academyNames = getAcademyNames(db)

  if (todayHw.length === 0 && overdueHw.length === 0) {
    return `☀️ <b>오늘 미완료 숙제 (점검)</b>\n\n정리 완료 — 미완료 항목 없음`
  }

  const lines: string[] = []
  lines.push('☀️ <b>오늘 미완료 숙제 (점검)</b>')
  lines.push('')

  lines.push('오늘 마감:')
  if (todayHw.length === 0) {
    lines.push('• 없음')
  } else {
    for (const h of todayHw) {
      const acName = academyNames.get(h.academyId) ?? '?'
      lines.push(`• [${esc(acName)}] ${esc(h.title)}`)
    }
  }
  lines.push('')

  lines.push('기한 지남:')
  if (overdueHw.length === 0) {
    lines.push('• 없음')
  } else {
    for (const h of overdueHw) {
      const acName = academyNames.get(h.academyId) ?? '?'
      const days = h.dueDate ? diffDays(h.dueDate, dateIso) : 0
      lines.push(`• [${esc(acName)}] (${days}일 지남) ${esc(h.title)}`)
    }
  }

  return lines.join('\n')
}
