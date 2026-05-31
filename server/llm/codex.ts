import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { readFileSync, unlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
// resolve는 Promise executor의 resolve와 이름이 겹치므로 alias (path.resolve를 toAbsolute로).
import { join, resolve as toAbsolute } from 'node:path'
import type { VisionProvider, ExtractInput, ExtractOutput } from './types'
import { buildPrompt } from './prompt'
import { parseModelResponse } from './response'

/**
 * codex CLI (ChatGPT Plus, auth_mode=chatgpt) 기반 vision provider.
 * gpt-5.5는 거의 풀해상도(~6000px)로 이미지를 읽어 작은 손글씨·본문 흩어진 숙제까지 잡는다.
 * ClaudeCliProvider와 동일 prompt(prompt.ts)를 쓰고, 이미지는 `-i` 플래그로 직접 첨부한다.
 *
 * 호출: codex exec -i <img...> -m gpt-5.5 --sandbox read-only --skip-git-repo-check -o <tmp>
 *  - prompt는 positional이 아니라 **stdin으로 파이프 후 즉시 close**.
 *    (positional + 다른 플래그 조합 시 codex가 "Reading additional input from stdin"으로
 *     prompt를 stdin에서 읽으려 해 빈 입력이 됨 — variadic `-i` 충돌도 회피.)
 *  - --sandbox read-only + --skip-git-repo-check: 비대화 실행, repo 밖에서도 동작.
 *  - -o <tmp>: 모델의 "최종 메시지"만 파일로 — stdout 로그(추론/세션 헤더) 스크래핑 회피.
 *    (파일이 없으면 stdout fallback → mock 단위테스트에서 그대로 동작.)
 *  - env는 그대로 상속해야 ~/.codex auth가 살아있다 (sanitize 금지).
 */
export class CodexProvider implements VisionProvider {
  readonly name = 'codex' as const
  readonly defaultModel = 'gpt-5.5'
  readonly availableModels = ['gpt-5.5'] as const
  // codex는 풀해상도 원본 사용 — 1순위 품질 경로. 다운스케일 금지.
  readonly fullResolution = true

  async extractHomework(input: ExtractInput): Promise<ExtractOutput> {
    const model = input.model ?? this.defaultModel
    const prompt = buildPrompt({ academy: input.academy, imagePaths: input.imagePaths, userHint: input.userHint })
    const timeoutMs = input.timeoutMs ?? 300_000   // 5분 (gpt-5.5 xhigh + 풀해상도 + 다항목)

    const raw = await this.runCodex(prompt, model, input.imagePaths, timeoutMs)
    const items = parseModelResponse(raw, 'Codex')
    return { items, rawResponse: raw, modelUsed: model }
  }

  private runCodex(prompt: string, model: string, imagePaths: string[], timeoutMs: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const outFile = join(tmpdir(), `codex-hw-${process.pid}-${Date.now()}.txt`)
      // cwd를 tmpdir로 두므로 이미지 경로는 반드시 절대경로로 (상대경로면 codex가 못 찾음).
      // 이미지마다 개별 -i (variadic 그리디 소비 방지).
      const imageArgs = imagePaths.flatMap((p) => ['-i', toAbsolute(p)])
      const args = [
        'exec',
        ...imageArgs,
        '-m', model,
        '--sandbox', 'read-only',
        '--skip-git-repo-check',
        '-o', outFile,
      ]
      const proc = spawn('codex', args, {
        stdio: 'pipe',       // stdin/stdout/stderr 모두 pipe (prompt를 stdin으로 전달)
        cwd: tmpdir(),       // repo 밖에서 실행 (git/config 간섭 회피)
        env: process.env,    // ~/.codex auth 상속 — sanitize 금지
      }) as ChildProcessWithoutNullStreams  // stdio:'pipe' → 스트림 non-null 보장
      // prompt를 stdin으로 전달 후 즉시 닫기 (안 닫으면 codex가 입력 대기로 hang).
      proc.stdin.write(prompt)
      proc.stdin.end()
      let stdout = ''
      let stderr = ''
      let settled = false
      const settle = (fn: () => void) => { if (settled) return; settled = true; fn() }
      const t = setTimeout(() => {
        proc.kill('SIGTERM')
        settle(() => reject(new Error(`codex exec timed out after ${timeoutMs}ms`)))
      }, timeoutMs)
      proc.stdout.on('data', (b) => { stdout += b.toString() })
      proc.stderr.on('data', (b) => { stderr += b.toString() })
      proc.on('error', (err) => {
        clearTimeout(t)
        settle(() => reject(err))
      })
      proc.on('close', (code) => {
        clearTimeout(t)
        if (code !== 0) {
          settle(() => reject(new Error(`codex exited with code ${code}; stderr=${stderr.slice(0, 500)}`)))
          return
        }
        // 우선 -o 파일(모델 최종 메시지 = clean), 없으면 stdout fallback.
        let raw = stdout
        try {
          const fileText = readFileSync(outFile, 'utf8')
          if (fileText.trim()) raw = fileText
        } catch {
          // 파일 없음 (예: mock된 단위테스트) → stdout 사용.
        }
        try { unlinkSync(outFile) } catch { /* ignore */ }
        settle(() => resolve(raw))
      })
    })
  }
}
