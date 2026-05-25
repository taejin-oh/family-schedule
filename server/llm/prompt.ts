import type { AcademyContext } from './types'
import { localDateIso } from '@/server/util/date'

export function buildPrompt(input: {
  academy: AcademyContext
  imagePaths: string[]
  userHint?: string | null
}): string {
  const next = input.academy.nextSessionAt ? localDateIso(input.academy.nextSessionAt) : '미정'
  const today = localDateIso()
  const imgs = input.imagePaths.map((p) => `- ${p}`).join('\n')
  const hint = input.userHint?.trim()

  const lines: string[] = [
    `당신은 한국 학원의 숙제 정보를 부모를 위해 정리하는 똑똑한 어시스턴트입니다.`,
    `학원 "${input.academy.name}" (과목: ${input.academy.subject})의 숙제 파일을 분석해주세요.`,
    `오늘 날짜: ${today}. 이 학원의 다음 수업일: ${next}.`,
    ``,
    `파일:`,
    imgs,
    ``,
    `=== 단계 1: 문서 구조 파악 ===`,
    `먼저 파일이 어떤 종류의 문서인지 판단하세요:`,
    `(a) 분기/학기 전체 시간표·syllabus — 날짜별 행이 있는 표 형식, 한 행에 여러 정보 (수업 토픽, 시험, 숙제 등)`,
    `(b) 단일 숙제지 — 한 번 분량의 숙제 리스트만 있음`,
    `(c) 알림장·공지문 — 자유 형식 텍스트`,
    `(d) 워크시트 자체 (학생이 풀 종이)`,
    ``,
    `=== 단계 2: 컨텍스트 수집 ===`,
    `문서 전체에서 다음 정보를 찾아두세요. 이건 나중에 각 숙제 항목을 풍부하게 만드는 데 씁니다:`,
    `- 책/교재 이름들 (Textbook, 교재 섹션, 헤더 등에 명시되어 있을 수 있음)`,
    `- 단원 번호 / 챕터 / 페이지 범위`,
    `- 수업 요일·시간 / 강사 / 학기 기간`,
    `- 시험/퀴즈 일정 (Vocab Quiz, Reading Test 등도 숙제로 취급)`,
  ]

  if (hint) {
    lines.push(
      ``,
      `=== 단계 3: 부모가 알려준 힌트 (반드시 우선 적용) ===`,
      hint,
      ``,
      `위 힌트가 가리키는 영역만 숙제로 추출하고, 힌트가 "무시"하라고 한 영역은 절대 항목으로 만들지 마세요.`,
    )
  } else {
    lines.push(
      ``,
      `=== 단계 3: 자체 판단으로 숙제 영역 식별 ===`,
      `힌트가 없으므로 다음 원칙으로 숙제를 골라내세요:`,
      `- 표 형식이면 "Homework" / "숙제" / "Assignment" 같은 헤더가 있는 열을 찾아 그 열만 숙제로 봄`,
      `- 그런 명시적 열이 없으면, "해야 할 일"을 가리키는 동사구 (Read, 풀기, 외우기, 작성, 제출 등)가 있는 텍스트를 숙제로 봄`,
      `- "Lesson Topics", "수업 내용", "Curriculum" 같은 열은 그 날 배운 내용이지 학생이 할 일이 아님 → 숙제 아님`,
      `- 단, Lesson Topics는 책 이름/단원 정보를 추출할 때는 참고함 (단계 4 참고)`,
      `- 시험/퀴즈 (Vocab Test, Reading Test 등)는 그 날까지 학생이 준비해야 하므로 숙제 항목으로 포함`,
      `- 공휴일·이벤트·방학 표시 (🌸 🏮 🎉 ⭐ 또는 빈 셀)은 항목 만들지 마`,
      `- 헷갈리면 누락 (false positive보다 missing이 나음)`,
    )
  }

  lines.push(
    ``,
    `=== 단계 4: 항목별 추출 + 컨텍스트 결합 ===`,
    `각 숙제 항목마다:`,
    `1. 그 행/문단에서 dueDate를 찾아냄 (표면 행의 Date 열, 텍스트면 "○월 ○일까지" 같은 표현)`,
    `   - 표에서 "(해당 날짜까지)" 헤더가 있는 열의 숙제 → dueDate = 그 행의 날짜`,
    `   - 명시 없으면 null`,
    `2. 숙제 내용을 한 줄 한국어로 (title) — 학생이 보면 즉시 알 수 있게`,
    `   - 책 이름이 있으면 포함 ("Sherlock Holmes Ch 7-8 읽기"). 책 이름이 표의 다른 셀(예: 같은 행의 Lesson Topics)에 있으면 그것과 결합. 헤더의 Textbook 목록과 매칭해서 정확한 책 이름을 씀 (예: "Sherlock" → "Sherlock Holmes: The Sign of Four")`,
    `   - 분량·페이지가 있으면 포함 ("p.20-30 풀기", "단어 50개")`,
    `3. notes에 모든 부가 정보 자세히`,
    `   - 책 풀네임, 단원, 페이지 범위, 활동 종류 (Read & Listen / Activities / Activity Book / Project 등)`,
    `   - 시험 범위 (Vocab #1-25 등)`,
    `   - 제출 방식, 보호자 확인 필요 여부 등`,
    `   - 같은 행의 Lesson Topics에서 가져올 수 있는 컨텍스트 (그 날 배운 챕터·주제)`,
    `4. 한 행에 여러 종류 숙제 (1. ..., 2. ..., 3. ...) → 각각 별도 항목으로 분리`,
    ``,
    `=== 단계 5: JSON으로만 응답 ===`,
    `다른 설명 문장 절대 넣지 마세요. JSON 코드 블록도 fence(\`\`\`) 없이 raw JSON으로:`,
    `{"items":[{"title":"...","dueDate":"YYYY-MM-DD or null","notes":"...","confidence":0.95,"sourcePhotoIndex":0}, ...]}`,
    ``,
    `각 항목에 다음 두 필드를 추가하세요:`,
    `- confidence: 0~1 사이 추출 확신도. 문서에서 명확히 읽힌 경우 0.9 이상, 맥락으로 추론한 경우 0.5~0.8, 추측이 섞이거나 근거가 불충분하면 0.5 미만.`,
    `- sourcePhotoIndex: 이 항목을 가장 강하게 뒷받침한 사진의 0-based index (제공된 이미지 배열 기준). 이미지가 한 장이면 항상 0.`,
    ``,
    `중요: 정확성 > 빠짐. 만약 한 항목의 정보가 부족해서 추측에 가까우면, notes에 "추측됨 — 검토 필요" 같은 표시를 남기세요. 부모가 리뷰 화면에서 수정합니다.`,
    `항목이 0개면 빈 배열 반환. 가짜 데이터 만들지 마세요.`,
  )

  return lines.join('\n')
}
