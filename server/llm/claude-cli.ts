import { spawn } from 'node:child_process'
import { z } from 'zod'
import type { VisionProvider, ExtractInput, ExtractOutput, DraftItem } from './types'
import { buildPrompt } from './prompt'

const ResponseSchema = z.object({
  items: z.array(z.object({
    title: z.string().min(1),
    dueDate: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.null()]),
    notes: z.string().optional(),
  })),
})

const FENCE = /```(?:json)?\s*([\s\S]*?)```/

function extractJson(text: string): string {
  const m = text.match(FENCE)
  if (m) return m[1].trim()
  // Try to find the outermost { ... }
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start >= 0 && end > start) return text.slice(start, end + 1)
  return text.trim()
}

export class ClaudeCliProvider implements VisionProvider {
  readonly name = 'claude' as const
  readonly defaultModel = 'claude-sonnet-4-6'
  readonly availableModels = ['claude-opus-4-7', 'claude-sonnet-4-6', 'claude-haiku-4-5'] as const

  async extractHomework(input: ExtractInput): Promise<ExtractOutput> {
    const model = input.model ?? this.defaultModel
    const prompt = buildPrompt({ academy: input.academy, imagePaths: input.imagePaths, userHint: input.userHint })
    const timeoutMs = input.timeoutMs ?? 60_000

    const stdout = await this.runClaude(prompt, model, timeoutMs)
    const jsonText = extractJson(stdout)
    let parsed: unknown
    try {
      parsed = JSON.parse(jsonText)
    } catch (e: any) {
      throw new Error(`Claude response JSON parse failed: ${e.message}; raw=${stdout.slice(0, 200)}`)
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
      const t = setTimeout(() => {
        proc.kill('SIGTERM')
        reject(new Error(`claude -p timed out after ${timeoutMs}ms`))
      }, timeoutMs)
      proc.stdout.on('data', (b) => { stdout += b.toString() })
      proc.stderr.on('data', (b) => { stderr += b.toString() })
      proc.on('close', (code) => {
        clearTimeout(t)
        if (code === 0) resolve(stdout)
        else reject(new Error(`claude exited with code ${code}; stderr=${stderr.slice(0, 500)}`))
      })
    })
  }
}
