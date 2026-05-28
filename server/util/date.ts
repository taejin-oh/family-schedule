/** YYYY-MM-DD in local timezone (NOT UTC). */
export function localDateIso(d: Date = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Returns YYYY-MM-DD of the Monday of the week containing dateIso. */
export function mondayOfWeekIso(dateIso: string): string {
  const [y, m, d] = dateIso.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  const day = dt.getDay()           // 0=Sun..6=Sat
  const diff = day === 0 ? -6 : 1 - day
  dt.setDate(dt.getDate() + diff)
  return localDateIso(dt)
}

/** Returns the local-day window [start, end) for a given local date.
 *  Used to compare `doneAt` timestamps against "today" in SQL queries
 *  in a TZ-explicit way (rather than relying on `setHours(0,0,0,0)` which
 *  depends on the Node process timezone). */
export function localDayWindow(d: Date = new Date()): { start: Date; end: Date } {
  const start = new Date(d)
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setDate(end.getDate() + 1)
  return { start, end }
}

/** 이번 주(월요일 자정 ~ 다음 주 월요일 자정 직전) 윈도우. 로컬 TZ 기준. */
export function localWeekWindow(d: Date = new Date()): { start: Date; end: Date } {
  const start = new Date(d)
  start.setHours(0, 0, 0, 0)
  const dow = start.getDay()  // 0=Sun..6=Sat
  // 월요일을 주의 시작으로 본다 (Sun이면 6일 이전 월요일).
  const offset = dow === 0 ? 6 : dow - 1
  start.setDate(start.getDate() - offset)
  const end = new Date(start)
  end.setDate(end.getDate() + 7)
  return { start, end }
}
