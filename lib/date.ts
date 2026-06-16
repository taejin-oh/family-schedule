// 순수 날짜/포맷 헬퍼 — 클라이언트·서버 양쪽에서 import 가능 (server-only/node 의존 없음).
// 여러 파일에 흩어져 있던 동일 구현을 한 곳으로 모은다.

/** 사용자 로컬 자정 기준 두 ISO 날짜(YYYY-MM-DD)의 일수 차 (due − today). */
export function diffDays(due: string, todayIso: string): number {
  const t = new Date(todayIso + 'T00:00:00')
  const d = new Date(due + 'T00:00:00')
  return Math.round((d.getTime() - t.getTime()) / 86_400_000)
}

/** 마감일 라벨: 지났음 / 오늘 / 내일 / N일 후(7일 이내) / 그 밖은 원본 날짜. due가 null이면 null. */
export function formatDueLabel(due: string | null, todayIso: string): string | null {
  if (!due) return null
  const dd = diffDays(due, todayIso)
  if (dd < 0) return `${Math.abs(dd)}일 지남`
  if (dd === 0) return '오늘'
  if (dd === 1) return '내일'
  if (dd <= 7) return `${dd}일 후`
  return due
}

/** getDay() 인덱스(0=일)용 한글 요일 약어. */
export const WEEKDAYS_KO = ['일', '월', '화', '수', '목', '금', '토'] as const
