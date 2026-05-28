// 아이 홈의 "오늘 할 일 없음" 빈 상태 카피.
// 원칙: "끝/완료/도착/박수/메달/칭찬" 같이 빈 상태(=다 끝낸 상태)와 직접 연결되는
// 표현만. 외모·속도·성격 칭찬이나 우리 시스템(별 모음 등)과 헷갈리는 표현은 제외.

export type EmptyState = {
  emoji: string
  title: string
  sub: string
}

export const DEFAULT_EMPTY_STATES: readonly EmptyState[] = [
  { emoji: '🎉', title: '오늘 할 일이 없어요!', sub: '잘했어!' },
  { emoji: '🌟', title: '오늘 다 끝!', sub: '대단해!' },
  { emoji: '🚀', title: '오늘 미션 완료!', sub: '멋져!' },
  { emoji: '🏆', title: '오늘 다 했어!', sub: '최고야!' },
  { emoji: '🌈', title: '오늘 끝났어요!', sub: '내일 또 만나요!' },
  { emoji: '🎊', title: '와! 끝!', sub: '은채 짱!' },
  { emoji: '💪', title: '오늘도 해냈다!', sub: '수고했어!' },
  { emoji: '🥳', title: '오늘 다 마쳤어!', sub: '축하해!' },
  { emoji: '😎', title: '쿨하게 끝!', sub: '프로다 진짜!' },
  { emoji: '📚', title: '공부 끝!', sub: '진짜 잘했어!' },
  { emoji: '🌙', title: '오늘 끝 — 좋은 꿈!', sub: '내일 또 화이팅!' },
  { emoji: '☀️', title: '쨍! 다 끝났어!', sub: '햇살처럼 환해!' },
  { emoji: '🎵', title: '딴딴딴! 완료!', sub: '신난다!' },
  { emoji: '🐢', title: '꾸준히 끝까지!', sub: '거북이 챔피언!' },
  { emoji: '🍀', title: '잘 풀린 하루!', sub: '다 끝났어!' },
  { emoji: '🧩', title: '퍼즐 다 맞췄어!', sub: '찰칵!' },
  { emoji: '🔥', title: '불타게 끝!', sub: '뜨거워!' },
  { emoji: '⛰️', title: '산 정상 도착!', sub: '야호!' },
  { emoji: '👏', title: '박수 받자!', sub: '잘했어 정말!' },
  { emoji: '💯', title: '오늘 100점!', sub: '완벽해!' },
  { emoji: '🏅', title: '오늘의 메달!', sub: '수여합니다!' },
  { emoji: '🐻', title: '곰돌이도 박수!', sub: '잘했어!' },
  { emoji: '✏️', title: '마지막 한 줄까지!', sub: '꼼꼼해!' },
  { emoji: '🥁', title: '두구두구두구... 끝!', sub: '짠!' },
  { emoji: '🐳', title: '고래만큼 큰 박수!', sub: '와아!' },
  { emoji: '🦔', title: '고슴도치도 박수!', sub: '콕콕 잘했어!' },
  { emoji: '🐧', title: '펭귄도 인정!', sub: '뒤뚱뒤뚱 칭찬!' },
  { emoji: '🐱', title: '야옹~ 끝!', sub: '고양이도 칭찬!' },
  { emoji: '🐶', title: '멍멍! 잘했어!', sub: '꼬리 흔드는 중!' },
  { emoji: '📣', title: '오늘의 챔피언!', sub: '짠짠짠!' },
] as const

/** todayIso로 시드를 만들어 같은 날 동안은 같은 메시지, 다음 날부터 바뀜. */
export function pickEmptyState(states: readonly EmptyState[], todayIso: string): EmptyState {
  const pool = states.length > 0 ? states : DEFAULT_EMPTY_STATES
  const [y, m, d] = todayIso.split('-').map(Number)
  const seed = (y * 372) + (m * 31) + d
  return pool[seed % pool.length]
}
