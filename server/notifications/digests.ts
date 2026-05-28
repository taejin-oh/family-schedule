import { drizzle } from 'drizzle-orm/better-sqlite3'
import { and, eq, isNull, lt } from 'drizzle-orm'
import * as schema from '@/server/db/schema'
import { escTelegramHtml as esc } from './escape'

type AppDb = ReturnType<typeof drizzle<typeof schema>>

const DAY_KO = ['일', '월', '화', '수', '목', '금', '토']

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

/** 이번 주(월~일) 시작 ISO 반환. dateIso 기준 그 주의 월요일. */
function startOfThisWeekIso(dateIso: string): string {
  const [y, m, d] = dateIso.split('-').map(Number)
  const today = new Date(y, m - 1, d)
  const dow = today.getDay()  // 0=Sun..6=Sat
  const offset = dow === 0 ? 6 : dow - 1  // 일요일이면 6일 전 월요일
  const mon = new Date(today)
  mon.setDate(mon.getDate() - offset)
  return `${mon.getFullYear()}-${String(mon.getMonth() + 1).padStart(2, '0')}-${String(mon.getDate()).padStart(2, '0')}`
}

/** 이번 주(월~일) 끝 ISO 반환. dateIso 기준 그 주의 일요일. */
function endOfThisWeekIso(dateIso: string): string {
  const [y, m, d] = dateIso.split('-').map(Number)
  const today = new Date(y, m - 1, d)
  const dow = today.getDay()
  const daysUntilSun = (7 - dow) % 7
  const sun = new Date(today)
  sun.setDate(sun.getDate() + daysUntilSun)
  return `${sun.getFullYear()}-${String(sun.getMonth() + 1).padStart(2, '0')}-${String(sun.getDate()).padStart(2, '0')}`
}

/** 어제 ISO. */
function prevDayIso(dateIso: string): string {
  const [y, m, d] = dateIso.split('-').map(Number)
  const prev = new Date(y, m - 1, d - 1)
  return `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}-${String(prev.getDate()).padStart(2, '0')}`
}

/**
 * 아침 7시 풍부한 digest.
 *
 * 섹션:
 * 1. 어제까지 했어야 하는 숙제 (어제 + overdue) — N/M 완료 표시
 * 2. 오늘까지 끝낼 것 (today + tomorrow 마감 — "오늘=내일까지" 정의)
 * 3. 이번 주 잔여 — 이번 주 마감 중 완료/잔여
 * 4. 오늘 학원
 *
 * 일요일이면 (2) → "이번 주 끝낼 거"로 라벨 변경 (그 주 마지막 날).
 */
export function buildMorningDigest(db: AppDb, dateIso: string): string {
  const yesterdayIso = prevDayIso(dateIso)
  const tomorrowIso = nextDayIso(dateIso)
  const weekStartIso = startOfThisWeekIso(dateIso)
  const weekEndIso = endOfThisWeekIso(dateIso)
  const dow = new Date(dateIso + 'T00:00:00').getDay()  // 0=Sun..6=Sat
  const isSunday = dow === 0

  const academyNames = getAcademyNames(db)
  const slots = todayAcademySlots(db, dateIso)

  // 1) 어제까지 마감인 것 (≤ yesterday) — 어제 + overdue 모두
  const overdue = homeworkOverdue(db, dateIso)  // dueDate < dateIso, doneAt null
  const yesterdayCommitted = db.select({
    id: schema.homeworkItems.id,
    title: schema.homeworkItems.title,
    dueDate: schema.homeworkItems.dueDate,
    academyId: schema.homeworkItems.academyId,
    doneAt: schema.homeworkItems.doneAt,
  }).from(schema.homeworkItems)
    .where(and(
      eq(schema.homeworkItems.isCommitted, true),
    ))
    .all()
    .filter((it) => it.dueDate && it.dueDate <= yesterdayIso)
  const yTotal = yesterdayCommitted.length
  const yDone = yesterdayCommitted.filter((it) => it.doneAt !== null).length

  // 2) 오늘/내일 마감 (사용자 정의: 오늘 = 내일까지)
  // 일요일이면 이번 주 잔여 강조 (오늘이 마지막 날)
  const todayTomorrowHw = db.select({
    id: schema.homeworkItems.id,
    title: schema.homeworkItems.title,
    dueDate: schema.homeworkItems.dueDate,
    academyId: schema.homeworkItems.academyId,
  }).from(schema.homeworkItems)
    .where(and(
      eq(schema.homeworkItems.isCommitted, true),
      isNull(schema.homeworkItems.doneAt),
    ))
    .all()
    .filter((it) => it.dueDate && it.dueDate >= dateIso && it.dueDate <= tomorrowIso)

  // 3) 이번 주 잔여 (이번 주 안 마감, 위 2)에 안 포함된 것만 = dueDate > tomorrow AND ≤ weekEnd)
  const thisWeekRemaining = db.select({
    id: schema.homeworkItems.id,
    title: schema.homeworkItems.title,
    dueDate: schema.homeworkItems.dueDate,
    academyId: schema.homeworkItems.academyId,
    doneAt: schema.homeworkItems.doneAt,
  }).from(schema.homeworkItems)
    .where(and(
      eq(schema.homeworkItems.isCommitted, true),
    ))
    .all()
    .filter((it) => it.dueDate && it.dueDate >= weekStartIso && it.dueDate <= weekEndIso)
  const weekTotal = thisWeekRemaining.length
  const weekDone = thisWeekRemaining.filter((it) => it.doneAt !== null).length

  // ── 메시지 빌드 ──
  const lines: string[] = []
  lines.push(`🌞 <b>좋은 아침이에요 (${dateIso} ${dayKo(dateIso)})</b>`)
  lines.push('')

  // 1. 어제까지
  lines.push(`📌 <b>어제까지 마감 (${yDone}/${yTotal} 완료)</b>`)
  if (yTotal === 0) {
    lines.push('• 어제 마감 없음')
  } else if (overdue.length === 0) {
    lines.push('🎉 어제까지 다 끝냈어요!')
  } else {
    for (const h of overdue) {
      const acName = academyNames.get(h.academyId) ?? '?'
      const daysLate = h.dueDate ? diffDays(h.dueDate, dateIso) : 0
      lines.push(`• ⚠️ [${esc(acName)}] ${esc(h.title)} (${daysLate}일 지남)`)
    }
  }
  lines.push('')

  // 2. 오늘 (≤ 내일 마감) — 일요일이면 라벨 변경
  const sectionLabel = isSunday
    ? `🎯 <b>이번 주 끝낼 거</b>`
    : `🎯 <b>오늘까지 끝낼 거</b>`
  lines.push(sectionLabel)
  if (todayTomorrowHw.length === 0 && !isSunday) {
    lines.push('• 오늘은 마감 없어요')
  } else if (todayTomorrowHw.length === 0 && isSunday) {
    lines.push('• 이번 주 안 마감 다 끝!')
  } else {
    for (const h of todayTomorrowHw) {
      const acName = academyNames.get(h.academyId) ?? '?'
      const due = h.dueDate ?? ''
      const dueLabel = due === dateIso ? '오늘' : due === tomorrowIso ? '내일' : due
      lines.push(`• [${esc(acName)}] ${esc(h.title)} (${dueLabel})`)
    }
  }
  lines.push('')

  // 3. 이번 주 진행 — 일요일 아닐 때만 별도 섹션 (일요일은 위 섹션과 같음)
  if (!isSunday) {
    const weekRemaining = weekTotal - weekDone
    lines.push(`📅 <b>이번 주 (${weekDone}/${weekTotal})</b>`)
    if (weekRemaining === 0) {
      lines.push('• 이번 주 다 끝났어요 ✨')
    } else if (weekRemaining === todayTomorrowHw.length) {
      lines.push('• 위 항목 외 다 끝! 미리 할 거 없어요')
    } else {
      lines.push(`• ${weekRemaining}개 남았어요 (오늘까지 끝낼 거 외 ${weekRemaining - todayTomorrowHw.length}개는 이번 주 안 마감)`)
    }
    lines.push('')
  }

  // 4. 오늘 학원
  lines.push('🏫 <b>오늘 학원</b>')
  if (slots.length === 0) {
    lines.push('• 오늘 학원 없음')
  } else {
    for (const s of slots) {
      lines.push(`• ${esc(s.start)}–${esc(s.end)} ${esc(s.name)}`)
    }
  }

  return lines.join('\n')
}

/**
 * 저녁 브리핑 — 하루 정리 + 휴리스틱 제안 + 내일 마감.
 *
 * 섹션:
 * 1. 오늘 다녀온 학원 (오늘 요일 schedule)
 * 2. 오늘 완료 항목 (doneAt이 오늘 안)
 * 3. 못 한 거 (오늘 마감 미완료 + overdue)
 * 4. 휴리스틱 제안 (3일 이상 누적 미완료가 있을 때만 — 어거지 X)
 * 5. 내일 마감
 *
 * 평범한 날 — 완료율 좋고 누적 없으면 "오늘 잘했어요 🌟"로 끝.
 */
export function buildEveningDigest(db: AppDb, dateIso: string): string {
  const tomorrowIso = nextDayIso(dateIso)
  const academyNames = getAcademyNames(db)

  // 1. 오늘 다녀온 학원 (오늘 요일 schedule)
  const slots = todayAcademySlots(db, dateIso)

  // 오늘 안에 완료된 committed items (doneAt 날짜가 오늘과 같음)
  const todayStart = new Date(dateIso + 'T00:00:00').getTime()
  const todayEnd = todayStart + 86400000
  const completedToday = db.select({
    id: schema.homeworkItems.id,
    title: schema.homeworkItems.title,
    academyId: schema.homeworkItems.academyId,
    doneAt: schema.homeworkItems.doneAt,
  }).from(schema.homeworkItems)
    .where(and(
      eq(schema.homeworkItems.isCommitted, true),
    ))
    .all()
    .filter((it) => it.doneAt && it.doneAt.getTime() >= todayStart && it.doneAt.getTime() < todayEnd)

  // 3. 못 한 거 — 오늘 마감 미완료 + overdue. type 통일: dueDate를 명시적으로 넣어줌.
  const todayDue = homeworkDueOn(db, dateIso)
  const overdue = homeworkOverdue(db, dateIso)
  type MissedItem = { id: number; title: string; academyId: number; dueDate: string | null }
  const missed: MissedItem[] = [
    ...todayDue.map((it) => ({ ...it, dueDate: dateIso })),
    ...overdue,
  ]

  // 카운트 (오늘 처리 대상: 오늘 마감 committed)
  const todayTargets = db.select({
    id: schema.homeworkItems.id,
    doneAt: schema.homeworkItems.doneAt,
  }).from(schema.homeworkItems)
    .where(and(
      eq(schema.homeworkItems.isCommitted, true),
      eq(schema.homeworkItems.dueDate, dateIso),
    ))
    .all()
  const todayDone = todayTargets.filter((it) => it.doneAt !== null).length
  const todayTotal = todayTargets.length

  // 5. 내일 마감
  const tomorrowDue = homeworkDueOn(db, tomorrowIso)

  // ── 메시지 빌드 ──
  const lines: string[] = []
  lines.push(`🌙 <b>오늘 정리 (${dateIso} ${dayKo(dateIso)})</b>`)
  lines.push('')

  // 1. 오늘 다녀온 학원
  if (slots.length > 0) {
    lines.push(`📚 <b>오늘 다녀온 학원 (${slots.length}곳)</b>`)
    for (const s of slots) {
      lines.push(`• ${esc(s.start)}–${esc(s.end)} ${esc(s.name)}`)
    }
    lines.push('')
  }

  // 2. 오늘 완료
  lines.push(`✅ <b>오늘 완료 (${todayDone}/${todayTotal})</b>`)
  if (completedToday.length === 0) {
    lines.push('• 오늘 완료한 항목 없음')
  } else {
    for (const h of completedToday) {
      const acName = academyNames.get(h.academyId) ?? '?'
      lines.push(`• [${esc(acName)}] ${esc(h.title)}`)
    }
  }
  lines.push('')

  // 3. 못 한 거 (오늘 마감 + overdue)
  if (missed.length > 0) {
    lines.push(`⚠️ <b>못 한 거 (${missed.length})</b>`)
    for (const h of missed) {
      const acName = academyNames.get(h.academyId) ?? '?'
      const daysLate = h.dueDate && h.dueDate < dateIso ? diffDays(h.dueDate, dateIso) : 0
      const suffix = daysLate > 0 ? ` (${daysLate}일 지남)` : ''
      lines.push(`• [${esc(acName)}] ${esc(h.title)}${suffix}`)
    }
    lines.push('')
  }

  // 4. 휴리스틱 제안 — 3일 이상 누적 미완료가 있을 때만 (어거지 X)
  const longOverdue = overdue.filter((it) => it.dueDate && diffDays(it.dueDate, dateIso) >= 3)
  if (longOverdue.length > 0) {
    lines.push(`💡 <b>제안</b>`)
    const sample = longOverdue[0]
    const acName = academyNames.get(sample.academyId) ?? '?'
    const days = sample.dueDate ? diffDays(sample.dueDate, dateIso) : 0
    if (longOverdue.length === 1) {
      lines.push(`[${esc(acName)}] ${esc(sample.title)}이 ${days}일째 밀려요.`)
      lines.push(`내일 미루기나 완료 처리해드릴까요? 룰루에게 "${esc(sample.title)} 내일로" / "완료" 라고 말해주세요.`)
    } else {
      lines.push(`${longOverdue.length}개 항목이 3일 이상 밀렸어요. 가장 오래된 건 [${esc(acName)}] ${esc(sample.title)} (${days}일).`)
      lines.push(`정리하시려면 룰루에게 말해주세요.`)
    }
    lines.push('')
  } else if (missed.length === 0 && completedToday.length > 0) {
    // 평범하고 잘한 날
    lines.push(`🌟 오늘 잘했어요! 🎉`)
    lines.push('')
  }

  // 5. 내일 마감
  if (tomorrowDue.length > 0) {
    lines.push(`📅 <b>내일 마감 (${tomorrowDue.length})</b>`)
    for (const h of tomorrowDue) {
      const acName = academyNames.get(h.academyId) ?? '?'
      lines.push(`• [${esc(acName)}] ${esc(h.title)}`)
    }
  } else {
    lines.push(`📅 내일은 마감 없어요`)
  }

  return lines.join('\n').trimEnd()
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
