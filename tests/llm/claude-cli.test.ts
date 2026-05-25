import { describe, it, expect, vi } from 'vitest'
import { ClaudeCliProvider } from '@/server/llm/claude-cli'
import * as childProcess from 'node:child_process'

vi.mock('node:child_process')

type Listener = (...args: unknown[]) => void
type MockProc = {
  stdout: { on: (ev: string, cb: Listener) => void }
  stderr: { on: (ev: string, cb: Listener) => void }
  on: (ev: string, cb: Listener) => void
  kill: () => void
}

function mockSpawnOnce(stdout: string, exitCode = 0): MockProc {
  const handlers: Record<string, Listener> = {}
  const proc: MockProc = {
    stdout: { on: (ev, cb) => { if (ev === 'data') cb(Buffer.from(stdout)) } },
    stderr: { on: () => {} },
    on: (ev, cb) => { handlers[ev] = cb },
    kill: () => {},
  }
  // ChildProcess type is broader than what we mock; coercion is intentional.
  vi.mocked(childProcess.spawn).mockReturnValueOnce(proc as unknown as ReturnType<typeof childProcess.spawn>)
  setTimeout(() => handlers['close']?.(exitCode), 0)
  return proc
}

describe('ClaudeCliProvider', () => {
  it('parses a valid JSON response into DraftItems', async () => {
    mockSpawnOnce(JSON.stringify({
      items: [
        { title: '문제집 p.20-30', dueDate: '2026-05-27', notes: '풀기' },
        { title: '오답노트 정리', dueDate: null },
      ]
    }))
    const p = new ClaudeCliProvider()
    const out = await p.extractHomework({
      imagePaths: ['/x/a.jpg'],
      academy: { name: '수학', subject: 'math', nextSessionAt: new Date('2026-05-27') },
    })
    expect(out.items).toHaveLength(2)
    expect(out.items[0].title).toBe('문제집 p.20-30')
    expect(out.items[0].dueDate).toBe('2026-05-27')
    expect(out.items[1].dueDate).toBeNull()
    expect(out.modelUsed).toBe('claude-opus-4-7')
  })

  it('throws a useful error when JSON is malformed', async () => {
    mockSpawnOnce('not json at all')
    const p = new ClaudeCliProvider()
    await expect(p.extractHomework({
      imagePaths: ['/x/a.jpg'],
      academy: { name: 'X', subject: 'other', nextSessionAt: null },
    })).rejects.toThrow(/parse|json/i)
  })

  it('extracts JSON from a fenced code block if the model wraps it', async () => {
    mockSpawnOnce('Here you go:\n```json\n{"items":[{"title":"a","dueDate":null}]}\n```\n')
    const p = new ClaudeCliProvider()
    const out = await p.extractHomework({
      imagePaths: ['/x/a.jpg'],
      academy: { name: 'X', subject: 'other', nextSessionAt: null },
    })
    expect(out.items).toHaveLength(1)
  })

  it('rejects on non-zero exit', async () => {
    mockSpawnOnce('partial', 1)
    const p = new ClaudeCliProvider()
    await expect(p.extractHomework({
      imagePaths: ['/x/a.jpg'],
      academy: { name: 'X', subject: 'other', nextSessionAt: null },
    })).rejects.toThrow(/exit/i)
  })
})
