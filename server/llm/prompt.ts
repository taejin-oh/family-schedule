import type { AcademyContext } from './types'

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export function buildPrompt(input: {
  academy: AcademyContext
  imagePaths: string[]
  userHint?: string | null
}): string {
  const next = input.academy.nextSessionAt ? fmtDate(input.academy.nextSessionAt) : '미정'
  const imgs = input.imagePaths.map((p) => `- ${p}`).join('\n')
  const hint = input.userHint?.trim()

  const lines: string[] = [
    `다음 파일(들)은 학원 "${input.academy.name}" (과목: ${input.academy.subject})의 숙제입니다. 사진이거나 PDF일 수 있습니다.`,
    `다음 학원일은 ${next}.`,
    ``,
    `파일:`,
    imgs,
    ``,
  ]

  if (hint) {
    lines.push(
      `🔍 부모가 알려준 이 학원의 파일 구조 힌트 (반드시 따를 것):`,
      hint,
      ``,
      `위 힌트가 가리키는 영역만 숙제로 추출하고, 힌트가 "무시"하라고 한 영역은 절대 항목으로 만들지 마세요.`,
      ``,
    )
  } else {
    lines.push(
      `힌트가 없으므로 파일을 검토해서 무엇이 숙제이고 무엇이 수업 토픽·시간표·안내문인지 스스로 판단하세요.`,
      `- 명확히 학생이 해야 할 일(과제·문제·암기·연습·읽기 등)만 숙제로 추출`,
      `- 수업 계획·교사 안내·일정표·연락처 같은 정보성 텍스트는 숙제 아님`,
      `- 헷갈리면 차라리 추출 안 함 (false positive보다 누락이 나음)`,
      ``,
    )
  }

  lines.push(
    `각 숙제 항목을 가능한 한 자세하게 추출해서 JSON으로만 응답해주세요. 다른 설명 문장은 넣지 마세요.`,
    `형식:`,
    `{"items":[{"title":"한 줄 핵심 요약","dueDate":"YYYY-MM-DD or null","notes":"부가 정보"}]}`,
    ``,
    `규칙 - title (한 줄, 한국어, 학생이 보고 즉시 할 일을 알 수 있게):`,
    `- 책 이름과 페이지/단원이 명확하면 포함 (예: "수학익힘책 p.20-30 풀기")`,
    `- 분량이 있으면 포함 (예: "영단어 50개 외우기")`,
    `- 한 줄로 못 담는 부가 정보는 notes로`,
    ``,
    `규칙 - notes (자세하게, 파일에서 읽을 수 있는 모든 관련 정보):`,
    `- 책/교재 이름, 단원 번호, 페이지 범위, 문제 번호, 분량(개수/페이지수)`,
    `- 제출 방식(쓰기/말하기/녹음/온라인 제출 등)`,
    `- 선생님 지시사항(오답노트 정리, 보호자 사인 등)`,
    `- 사진/PDF에 있는 정보를 빠뜨리지 말고 한국어로 정리`,
    `- 정말 부가 정보가 없으면 빈 문자열이나 생략`,
    ``,
    `규칙 - dueDate:`,
    `- 파일에 명시된 기한이 있으면 그 날짜 (YYYY-MM-DD), 없으면 null`,
    ``,
    `규칙 - 일반:`,
    `- 한 페이지에 여러 종류 숙제가 있으면 각각을 별도 항목으로 분리`,
    `- 항목이 없으면 빈 배열 반환`,
  )

  return lines.join('\n')
}
