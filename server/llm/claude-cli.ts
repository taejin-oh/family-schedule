import { spawn } from 'node:child_process'
import { z } from 'zod'
import type { VisionProvider, ExtractInput, ExtractOutput, DraftItem } from './types'
import { buildPrompt } from './prompt'

const ResponseSchema = z.object({
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

export class ClaudeCliProvider implements VisionProvider {
  readonly name = 'claude' as const
  readonly defaultModel = 'claude-opus-4-8'  // 교차 셀 추론 필요한 학원 syllabus 추출은 Sonnet으론 부족. 4.8 사용 가능 시 우선.
  readonly availableModels = ['claude-opus-4-8', 'claude-opus-4-7', 'claude-sonnet-4-6', 'claude-haiku-4-5'] as const

  async extractHomework(input: ExtractInput): Promise<ExtractOutput> {
    const model = input.model ?? this.defaultModel
    const prompt = buildPrompt({ academy: input.academy, imagePaths: input.imagePaths, userHint: input.userHint })
    const timeoutMs = input.timeoutMs ?? 300_000   // 5분 (Opus + 긴 PDF + 힌트 + 표 구조 추론)

    const stdout = await this.runClaude(prompt, model, timeoutMs)
    const jsonText = extractJson(stdout)
    let parsed: unknown
    try {
      parsed = JSON.parse(jsonText)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      throw new Error(`Claude response JSON parse failed: ${msg}; raw=${stdout.slice(0, 200)}`)
    }
    // 모델이 `{ items: [...] }` 대신 items 배열만 뱉은 경우 자동 wrap.
    if (Array.isArray(parsed)) {
      parsed = { items: parsed }
    }
    const validated = ResponseSchema.parse(parsed)
    const items: DraftItem[] = validated.items
    return { items, rawResponse: stdout, modelUsed: model }
  }

  private runClaude(prompt: string, model: string, timeoutMs: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const proc = spawn('claude', ['-p', prompt, '--model', model, '--output-format', 'text'], {
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      let stdout = ''
      let stderr = ''
      let settled = false
      const settle = (fn: () => void) => { if (settled) return; settled = true; fn() }
      const t = setTimeout(() => {
        proc.kill('SIGTERM')
        settle(() => reject(new Error(`claude -p timed out after ${timeoutMs}ms`)))
      }, timeoutMs)
      proc.stdout.on('data', (b) => { stdout += b.toString() })
      proc.stderr.on('data', (b) => { stderr += b.toString() })
      proc.on('error', (err) => {
        clearTimeout(t)
        settle(() => reject(err))
      })
      proc.on('close', (code) => {
        clearTimeout(t)
        if (code === 0) settle(() => resolve(stdout))
        else settle(() => reject(new Error(`claude exited with code ${code}; stderr=${stderr.slice(0, 500)}`)))
      })
    })
  }
}
