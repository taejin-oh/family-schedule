import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { readFileSync, unlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export type TextLLMOpts = { provider: string; model: string; timeoutMs?: number }

/** 이미지 없는 텍스트 생성. provider 'codex' → codex exec, 그 외 → claude -p. */
export function runTextLLM(prompt: string, opts: TextLLMOpts): Promise<string> {
  const timeoutMs = opts.timeoutMs ?? 120_000
  return opts.provider === 'codex'
    ? runCodexText(prompt, opts.model, timeoutMs)
    : runClaudeText(prompt, opts.model, timeoutMs)
}

function runCodexText(prompt: string, model: string, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const outFile = join(tmpdir(), `codex-rep-${process.pid}-${Date.now()}.txt`)
    const proc = spawn('codex', ['exec', '-m', model, '--sandbox', 'read-only', '--skip-git-repo-check', '-o', outFile], {
      stdio: 'pipe', cwd: tmpdir(), env: process.env,
    }) as ChildProcessWithoutNullStreams
    proc.stdin.write(prompt); proc.stdin.end()
    let stdout = ''; let stderr = ''; let settled = false
    const settle = (fn: () => void) => { if (settled) return; settled = true; fn() }
    const t = setTimeout(() => { proc.kill('SIGTERM'); settle(() => reject(new Error(`codex text timed out after ${timeoutMs}ms`))) }, timeoutMs)
    proc.stdout.on('data', (b) => { stdout += b.toString() })
    proc.stderr.on('data', (b) => { stderr += b.toString() })
    proc.on('error', (err) => { clearTimeout(t); settle(() => reject(err)) })
    proc.on('close', (code) => {
      clearTimeout(t)
      if (code !== 0) { settle(() => reject(new Error(`codex exited ${code}; ${stderr.slice(0, 300)}`))); return }
      let raw = stdout
      try { const f = readFileSync(outFile, 'utf8'); if (f.trim()) raw = f } catch { /* stdout fallback */ }
      try { unlinkSync(outFile) } catch { /* ignore */ }
      settle(() => resolve(raw.trim()))
    })
  })
}

function runClaudeText(prompt: string, model: string, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn('claude', ['-p', prompt, '--model', model, '--output-format', 'text'], { stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''; let stderr = ''; let settled = false
    const settle = (fn: () => void) => { if (settled) return; settled = true; fn() }
    const t = setTimeout(() => { proc.kill('SIGTERM'); settle(() => reject(new Error(`claude text timed out after ${timeoutMs}ms`))) }, timeoutMs)
    proc.stdout?.on('data', (b) => { stdout += b.toString() })
    proc.stderr?.on('data', (b) => { stderr += b.toString() })
    proc.on('error', (err) => { clearTimeout(t); settle(() => reject(err)) })
    proc.on('close', (code) => {
      clearTimeout(t)
      if (code === 0) settle(() => resolve(stdout.trim()))
      else settle(() => reject(new Error(`claude exited ${code}; ${stderr.slice(0, 300)}`)))
    })
  })
}
