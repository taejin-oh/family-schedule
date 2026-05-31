import { spawn } from 'node:child_process'
import type { VisionProvider, ExtractInput, ExtractOutput } from './types'
import { buildPrompt } from './prompt'
import { parseModelResponse } from './response'

// extractJson은 응답 파싱 공유 모듈로 이동. 기존 import 경로 호환을 위해 re-export.
export { extractJson } from './response'

export class ClaudeCliProvider implements VisionProvider {
  readonly name = 'claude' as const
  readonly defaultModel = 'claude-opus-4-8'  // 교차 셀 추론 필요한 학원 syllabus 추출은 Sonnet으론 부족. 4.8 사용 가능 시 우선.
  readonly availableModels = ['claude-opus-4-8', 'claude-opus-4-7', 'claude-sonnet-4-6', 'claude-haiku-4-5'] as const
  // claude는 resized(2576px) 경로 사용 — Anthropic subprocess 전용 제약 + Read 경로 보수적.
  readonly fullResolution = false

  async extractHomework(input: ExtractInput): Promise<ExtractOutput> {
    const model = input.model ?? this.defaultModel
    const prompt = buildPrompt({ academy: input.academy, imagePaths: input.imagePaths, userHint: input.userHint })
    const timeoutMs = input.timeoutMs ?? 300_000   // 5분 (Opus + 긴 PDF + 힌트 + 표 구조 추론)

    const stdout = await this.runClaude(prompt, model, timeoutMs)
    const items = parseModelResponse(stdout, 'Claude')
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
