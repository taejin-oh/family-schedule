import { drizzle } from 'drizzle-orm/better-sqlite3'
import { isNull } from 'drizzle-orm'
import * as schema from '@/server/db/schema'

type AppDb = ReturnType<typeof drizzle<typeof schema>>

/**
 * 학원 시작/종료 10분 전 알림.
 * 매분 worker polling에서 `findUpcomingAcademyEvents(db, dateIso, hhmm)` 호출.
 * `hhmm`이 어느 슬롯의 (start-10) 또는 (end-10)과 일치하면 메시지 반환.
 *
 * 중복 발송 방지는 호출자(worker)가 in-memory Set으로 (date+slotKey+type) 기록.
 */

const DAY_KEYS: schema.Day[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

export type AcademyEvent = {
  type: 'start' | 'end'
  academyId: number
  academyName: string
  slotStart: string  // HH:MM (학원의 원본 시작 시각)
  slotEnd: string
  slotKey: string    // dedupe용: "{academyId}|{day}|{start}"
  message: string    // Telegram HTML 메시지
}

/** HH:MM 문자열에서 분(시*60 + 분) */
function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

/** 분을 다시 HH:MM */
function toHHMM(mins: number): string {
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/**
 * 주어진 시각(`hhmm`)이 오늘 학원 슬롯의 (start-N) 또는 (end-N)과
 * 정확히 일치하면 알림 이벤트들 반환.
 * 자정 wrap (음수 분) 케이스는 제외 — 학원 시간이 06:00 이전은 비현실적.
 */
export function findUpcomingAcademyEvents(
  db: AppDb,
  dateIso: string,
  hhmm: string,
  minutesBefore = 10,
): AcademyEvent[] {
  const [y, m, d] = dateIso.split('-').map(Number)
  const dayIndex = new Date(y, m - 1, d).getDay()
  const todayKey = DAY_KEYS[dayIndex]
  const nowMin = toMinutes(hhmm)
  const N = Math.max(1, Math.min(60, minutesBefore))

  const academies = db.select().from(schema.academies)
    .where(isNull(schema.academies.archivedAt))
    .all()

  const events: AcademyEvent[] = []
  for (const a of academies) {
    if (!a.scheduleRule?.slots) continue
    for (const slot of a.scheduleRule.slots) {
      if (slot.day !== todayKey) continue
      const startMin = toMinutes(slot.start)
      const endMin = toMinutes(slot.end)
      const startBefore = startMin - N
      const endBefore = endMin - N

      if (startBefore === nowMin && startBefore >= 0) {
        events.push({
          type: 'start',
          academyId: a.id,
          academyName: a.name,
          slotStart: slot.start,
          slotEnd: slot.end,
          slotKey: `${a.id}|${slot.day}|${slot.start}|start`,
          message: `🔔 <b>${N}분 후 ${escHtml(a.name)} 학원 시작</b>이에요 (${slot.start}~${slot.end})\n은채야 준비해~ ✨`,
        })
      }
      if (endBefore === nowMin && endBefore !== startBefore) {
        events.push({
          type: 'end',
          academyId: a.id,
          academyName: a.name,
          slotStart: slot.start,
          slotEnd: slot.end,
          slotKey: `${a.id}|${slot.day}|${slot.start}|end`,
          message: `🔔 <b>${escHtml(a.name)} 학원 ${N}분 후 종료</b>예요 (${slot.end}까지)`,
        })
      }
    }
  }
  return events
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// HH:MM helpers exported for tests / future use
export const _internals = { toMinutes, toHHMM }
