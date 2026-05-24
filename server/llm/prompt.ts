import type { AcademyContext } from './types'

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export function buildPrompt(input: {
  academy: AcademyContext
  imagePaths: string[]
}): string {
  const next = input.academy.nextSessionAt ? fmtDate(input.academy.nextSessionAt) : '미정'
  const imgs = input.imagePaths.map((p) => `- ${p}`).join('\n')
  return [
    `다음 파일(들)은 학원 "${input.academy.name}" (과목: ${input.academy.subject})의 숙제입니다. 사진이거나 PDF일 수 있습니다.`,
    `다음 학원일은 ${next}.`,
    ``,
    `파일:`,
    imgs,
    ``,
    `각 숙제 항목을 추출해서 JSON으로만 응답해주세요. 다른 설명 문장은 넣지 마세요.`,
    `형식:`,
    `{"items":[{"title":"한국어 요약","dueDate":"YYYY-MM-DD or null","notes":"선택"}]}`,
    ``,
    `규칙:`,
    `- title은 한국어로, 학생이 보고 무엇을 할지 명확히 알 수 있게 작성`,
    `- 파일에 명시된 기한이 있으면 dueDate에 그 날짜를, 없으면 null`,
    `- notes는 보충 설명 (페이지 번호, 분량 등), 없으면 생략`,
    `- 항목이 없으면 빈 배열 반환`,
  ].join('\n')
}
