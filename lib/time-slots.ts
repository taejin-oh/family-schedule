const DAY_END_MINUTES = 24 * 60

export type ScheduleSlotDraft = {
  day: string
  start: string
  end: string
}

export function sanitizeTimeDraft(raw: string) {
  return raw.replace(/[^\d:]/g, '').slice(0, 5)
}

export function timeToMinutes(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value)
  if (!match) return null
  const hour = Number(match[1])
  const minute = Number(match[2])
  if (hour < 0 || hour > 24 || minute < 0 || minute > 59) return null
  if (hour === 24 && minute !== 0) return null
  return hour * 60 + minute
}

export function isValidScheduleTime(value: string) {
  return timeToMinutes(value) !== null
}

export function isValidTimeRange(start: string, end: string) {
  const startMinutes = timeToMinutes(start)
  const endMinutes = timeToMinutes(end)
  return startMinutes !== null && endMinutes !== null && startMinutes < endMinutes
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n))
}

function toTimeString(minutes: number) {
  const bounded = clamp(minutes, 0, DAY_END_MINUTES)
  const hour = Math.floor(bounded / 60)
  const minute = bounded % 60
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

function parseDraft(raw: string, fallback: string) {
  const trimmed = raw.trim()
  if (!trimmed) return timeToMinutes(fallback) ?? 0

  let hour: number
  let minute: number
  if (trimmed.includes(':')) {
    const [h = '', m = ''] = trimmed.split(':')
    hour = Number(h || 0)
    minute = Number(m || 0)
  } else {
    const digits = trimmed.replace(/\D/g, '')
    if (!digits) return timeToMinutes(fallback) ?? 0
    if (digits.length <= 2) {
      hour = Number(digits)
      minute = 0
    } else if (digits.length === 3) {
      hour = Number(digits.slice(0, 1))
      minute = Number(digits.slice(1, 3))
    } else {
      hour = Number(digits.slice(0, 2))
      minute = Number(digits.slice(2, 4))
    }
  }

  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return timeToMinutes(fallback) ?? 0
  const boundedHour = clamp(Math.trunc(hour), 0, 24)
  const boundedMinute = boundedHour === 24 ? 0 : clamp(Math.trunc(minute), 0, 59)
  return boundedHour * 60 + boundedMinute
}

export function normalizeTimeDraft(raw: string, fallback: string) {
  const value = toTimeString(parseDraft(raw, fallback))
  const warning = raw.trim() === value ? null : `시간을 ${value}로 자동 보정했어요.`
  return { value, warning }
}

export function normalizeSlotAfterEdit<T extends ScheduleSlotDraft>(
  slot: T,
  editedField: 'start' | 'end',
) {
  let start = normalizeTimeDraft(slot.start, '19:00').value
  let end = normalizeTimeDraft(slot.end, '21:00').value
  let warning: string | null = null

  let startMinutes = timeToMinutes(start) ?? 0
  let endMinutes = timeToMinutes(end) ?? DAY_END_MINUTES

  if (start !== slot.start || end !== slot.end) {
    warning = `${start}–${end}로 자동 보정했어요.`
  }

  if (startMinutes >= endMinutes) {
    if (editedField === 'start') {
      endMinutes = Math.min(startMinutes + 60, DAY_END_MINUTES)
      if (startMinutes >= endMinutes) startMinutes = Math.max(endMinutes - 60, 0)
    } else {
      startMinutes = Math.max(endMinutes - 60, 0)
      if (startMinutes >= endMinutes) endMinutes = Math.min(startMinutes + 60, DAY_END_MINUTES)
    }
    start = toTimeString(startMinutes)
    end = toTimeString(endMinutes)
    warning = `시작/종료 순서가 맞도록 ${start}–${end}로 자동 조정했어요.`
  }

  return { slot: { ...slot, start, end }, warning }
}

export function normalizeSlotsForSubmit<T extends ScheduleSlotDraft>(slots: T[]) {
  const warnings: string[] = []
  const normalized = slots.map((slot) => {
    const res = normalizeSlotAfterEdit(slot, 'start')
    if (res.warning) warnings.push(res.warning)
    return res.slot
  })
  return { slots: normalized, warning: warnings[0] ?? null }
}
