import { describe, it, expect, vi, beforeEach } from 'vitest'

const { logEventMock } = vi.hoisted(() => ({ logEventMock: vi.fn() }))
vi.mock('@/server/log/events', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/server/log/events')>()
  return { ...actual, logEvent: logEventMock }
})

import { POST } from '@/app/api/log/route'

function makeReq(body: string | object, headers: Record<string, string> = {}) {
  return new Request('http://localhost/api/log', {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { 'content-type': 'application/json', ...headers },
  })
}

describe('POST /api/log', () => {
  beforeEach(() => {
    logEventMock.mockReset()
  })

  it('200 + calls logEvent for valid payload', async () => {
    const res = await POST(makeReq({ category: 'mutation', event: 'homework.create', props: { id: 1 } }))
    expect(res.status).toBe(200)
    expect(logEventMock).toHaveBeenCalledOnce()
    const call = logEventMock.mock.calls[0][0]
    expect(call.category).toBe('mutation')
    expect(call.event).toBe('homework.create')
    expect(call.props).toEqual({ id: 1 })
  })

  it('400 for invalid JSON', async () => {
    const res = await POST(makeReq('not json{{'))
    expect(res.status).toBe(400)
    expect(logEventMock).not.toHaveBeenCalled()
  })

  it('400 for non-object body', async () => {
    const res = await POST(makeReq('"just a string"'))
    expect(res.status).toBe(400)
    expect(logEventMock).not.toHaveBeenCalled()
  })

  it('400 for unknown category', async () => {
    const res = await POST(makeReq({ category: 'attack', event: 'pwn' }))
    expect(res.status).toBe(400)
    expect(logEventMock).not.toHaveBeenCalled()
  })

  it('400 for missing event', async () => {
    const res = await POST(makeReq({ category: 'mutation' }))
    expect(res.status).toBe(400)
    expect(logEventMock).not.toHaveBeenCalled()
  })

  it('413 for oversize body', async () => {
    const huge = 'x'.repeat(20 * 1024)
    const res = await POST(makeReq({ category: 'mutation', event: 'x', props: { big: huge } }))
    expect(res.status).toBe(413)
    expect(logEventMock).not.toHaveBeenCalled()
  })

  it('accepts all 6 allowed categories', async () => {
    const cats = ['navigation', 'interaction', 'mutation', 'error', 'perf', 'feature']
    for (const c of cats) {
      const res = await POST(makeReq({ category: c, event: 'x' }))
      expect(res.status).toBe(200)
    }
    expect(logEventMock).toHaveBeenCalledTimes(cats.length)
  })

  it('passes user-agent header through', async () => {
    await POST(makeReq({ category: 'feature', event: 'x' }, { 'user-agent': 'test-ua/1.0' }))
    const call = logEventMock.mock.calls[0][0]
    expect(call.userAgent).toBe('test-ua/1.0')
  })

  it('passes sessionId and path from body', async () => {
    await POST(makeReq({ category: 'navigation', event: 'page_enter', sessionId: 's-1', path: '/x' }))
    const call = logEventMock.mock.calls[0][0]
    expect(call.sessionId).toBe('s-1')
    expect(call.path).toBe('/x')
  })
})
