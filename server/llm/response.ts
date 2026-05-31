import { z } from 'zod'
import type { DraftItem } from './types'

/**
 * 모든 vision provider의 추출 응답 공통 스키마 + 파서.
 * claude / codex 가 동일한 prompt.ts 출력을 쓰므로 응답 형태도 동일 — 한 곳에서 관리.
 */
export const ResponseSchema = z.object({
  items: z.array(z.object({
    title: z.string().min(1),
    dueDate: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.null()]),
    notes: z.string().optional(),
    confidence: z.number().min(0).max(1).optional(),
    confidenceReason: z.string().optional(),
    sourcePhotoIndex: z.number().int().nonnegative().optional(),
  })),
})

const FENCE = /```(?:json)?\s*([\s\S]*?)```/

/**
 * 모델 응답에서 JSON 본문 추출. 우선순위:
 * 1. ```json ... ``` 펜스 안 본문
 * 2. `{` 와 `[` 중 더 먼저 나오는 쪽으로 outermost JSON 범위 결정
 *    - `{` 가 먼저면 첫 `{` ~ 마지막 `}` (객체 wrapper, 가장 일반적)
 *    - `[` 가 먼저면 첫 `[` ~ 마지막 `]` (items 배열만 뱉은 경우)
 *    먼저 나오는 쪽을 채택하지 않으면 `[ {...}, {...} ]` 같은 입력에서
 *    배열 안 객체를 잘못 잡아 wrapper `[ ]` 가 누락되는 버그가 생김.
 * 3. 그래도 못 찾으면 trim 후 그대로 (JSON.parse에서 실패할 가능성 높음)
 */
export function extractJson(text: string): string {
  const m = text.match(FENCE)
  if (m) return m[1].trim()
  const objStart = text.indexOf('{')
  const arrStart = text.indexOf('[')
  const useArray = arrStart >= 0 && (objStart < 0 || arrStart < objStart)
  if (useArray) {
    const arrEnd = text.lastIndexOf(']')
    if (arrEnd > arrStart) return text.slice(arrStart, arrEnd + 1)
  } else if (objStart >= 0) {
    const objEnd = text.lastIndexOf('}')
    if (objEnd > objStart) return text.slice(objStart, objEnd + 1)
  }
  return text.trim()
}

/**
 * 모델 raw 응답 → 검증된 DraftItem[]. extractJson → JSON.parse → (배열이면 wrap) → 스키마 검증.
 * @param providerLabel 에러 메시지에 표시할 provider 이름 (예: 'Claude', 'Codex').
 */
export function parseModelResponse(raw: string, providerLabel: string): DraftItem[] {
  const jsonText = extractJson(raw)
  let parsed: unknown
  try {
    parsed = JSON.parse(jsonText)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    throw new Error(`${providerLabel} response JSON parse failed: ${msg}; raw=${raw.slice(0, 200)}`)
  }
  // 모델이 `{ items: [...] }` 대신 items 배열만 뱉은 경우 자동 wrap.
  if (Array.isArray(parsed)) parsed = { items: parsed }
  return ResponseSchema.parse(parsed).items
}
