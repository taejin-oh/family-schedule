import { describe, it, expect, vi } from 'vitest'
import { CodexProvider } from '@/server/llm/codex'
import * as childProcess from 'node:child_process'

vi.mock('node:child_process')

type Listener = (...args: unknown[]) => void
type MockProc = {
  stdout: { on: (ev: string, cb: Listener) => void }
  stderr: { on: (ev: string, cb: Listener) => void }
  stdin: { write: (s: string) => void; end: () => void }
  on: (ev: string, cb: Listener) => void
  kill: () => void
  _stdinData: string
}

// codex는 -o <file>에 최종 메시지를 쓰지만, 단위테스트에선 그 파일이 없으므로
// (실제 codex 미실행) provider가 stdout fallback으로 동작함을 검증한다.
// prompt는 stdin으로 전달되므로 mock stdin이 받은 내용을 _stdinData에 모은다.
function mockSpawnOnce(stdout: string, exitCode = 0): MockProc {
  const handlers: Record<string, Listener> = {}
  const proc: MockProc = {
    stdout: { on: (ev, cb) => { if (ev === 'data') cb(Buffer.from(stdout)) } },
    stderr: { on: () => {} },
    stdin: { write(s: string) { proc._stdinData += s }, end() {} },
    on: (ev, cb) => { handlers[ev] = cb },
    kill: () => {},
    _stdinData: '',
  }
  vi.mocked(childProcess.spawn).mockReturnValueOnce(proc as unknown as ReturnType<typeof childProcess.spawn>)
  setTimeout(() => handlers['close']?.(exitCode), 0)
  return proc
}

describe('CodexProvider', () => {
  it('declares full-resolution + gpt-5.5 defaults', () => {
    const p = new CodexProvider()
    expect(p.name).toBe('codex')
    expect(p.fullResolution).toBe(true)
    expect(p.defaultModel).toBe('gpt-5.5')
    expect(p.availableModels).toContain('gpt-5.5')
  })

  it('parses a valid JSON response into DraftItems (stdout fallback)', async () => {
    mockSpawnOnce(JSON.stringify({
      items: [
        { title: '어휘교재 38쪽까지', dueDate: '2026-06-04', notes: '색연필 표시', confidence: 0.98 },
        { title: '일기 쓰기', dueDate: '2026-06-01' },
      ]
    }))
    const p = new CodexProvider()
    const out = await p.extractHomework({
      imagePaths: ['/x/a.jpg'],
      academy: { name: '국어', subject: 'korean', nextSessionAt: new Date('2026-06-04') },
    })
    expect(out.items).toHaveLength(2)
    expect(out.items[0].title).toBe('어휘교재 38쪽까지')
    expect(out.items[0].confidence).toBe(0.98)
    expect(out.items[1].dueDate).toBe('2026-06-01')
    expect(out.modelUsed).toBe('gpt-5.5')
  })

  it('strips codex stdout log preamble and extracts the JSON object', async () => {
    // 실제 codex stdout: 세션 헤더 + 추론 줄 다음에 JSON, 뒤에 토큰 사용량.
    mockSpawnOnce(
      'session id: abc-123\nhook: SessionStart\ncodex\n이미지를 읽고 정리합니다.\n' +
      '{"items":[{"title":"어휘교재 38쪽까지","dueDate":"2026-06-04"}]}\n' +
      'tokens used\n27103\n'
    )
    const p = new CodexProvider()
    const out = await p.extractHomework({
      imagePaths: ['/x/a.jpg'],
      academy: { name: '국어', subject: 'korean', nextSessionAt: null },
    })
    expect(out.items).toHaveLength(1)
    expect(out.items[0].title).toBe('어휘교재 38쪽까지')
  })

  it('auto-wraps a bare array response into { items: [...] }', async () => {
    mockSpawnOnce('[{"title":"a","dueDate":null},{"title":"b","dueDate":"2026-06-08"}]')
    const p = new CodexProvider()
    const out = await p.extractHomework({
      imagePaths: ['/x/a.jpg'],
      academy: { name: 'X', subject: 'other', nextSessionAt: null },
    })
    expect(out.items).toHaveLength(2)
    expect(out.items[1].dueDate).toBe('2026-06-08')
  })

  it('throws a useful error when JSON is malformed', async () => {
    mockSpawnOnce('not json at all')
    const p = new CodexProvider()
    await expect(p.extractHomework({
      imagePaths: ['/x/a.jpg'],
      academy: { name: 'X', subject: 'other', nextSessionAt: null },
    })).rejects.toThrow(/parse|json/i)
  })

  it('rejects on non-zero exit', async () => {
    mockSpawnOnce('boom', 1)
    const p = new CodexProvider()
    await expect(p.extractHomework({
      imagePaths: ['/x/a.jpg'],
      academy: { name: 'X', subject: 'other', nextSessionAt: null },
    })).rejects.toThrow(/exit/i)
  })

  it('passes one -i flag per image, no positional prompt, and pipes prompt via stdin', async () => {
    const proc = mockSpawnOnce('{"items":[]}')
    const p = new CodexProvider()
    await p.extractHomework({
      imagePaths: ['/x/a.jpg', '/x/b.jpg'],
      academy: { name: 'X', subject: 'other', nextSessionAt: null },
    })
    const call = vi.mocked(childProcess.spawn).mock.calls.at(-1)!
    const args = call[1] as string[]
    // 이미지마다 개별 -i
    expect(args.filter((a) => a === '-i')).toHaveLength(2)
    expect(args[args.indexOf('/x/a.jpg') - 1]).toBe('-i')
    expect(args[args.indexOf('/x/b.jpg') - 1]).toBe('-i')
    // 모델 지정
    expect(args).toContain('-m')
    expect(args).toContain('gpt-5.5')
    // prompt는 argv에 없어야 함 (stdin으로 전달)
    expect(args.some((a) => a.includes('학원'))).toBe(false)
    // stdin은 pipe, prompt가 stdin으로 흘러감
    const opts = call[2] as { stdio?: unknown }
    expect(opts.stdio).toBe('pipe')
    expect(proc._stdinData).toContain('학원')
  })
})
