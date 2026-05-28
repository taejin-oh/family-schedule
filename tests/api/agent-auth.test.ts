import { describe, it, expect, vi, afterEach } from 'vitest'
import { checkAgentAuth } from '@/app/api/agent/_auth'

function makeReq(headers: Record<string, string> = {}) {
  return new Request('http://localhost/api/agent/test', { headers })
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('checkAgentAuth', () => {
  it('503 when AGENT_API_TOKEN env is not set (safe default)', () => {
    vi.stubEnv('AGENT_API_TOKEN', '')
    const res = checkAgentAuth(makeReq({ authorization: 'Bearer anything' }))
    expect(res).not.toBeNull()
    expect(res!.status).toBe(503)
  })

  it('401 when Authorization header is missing', () => {
    vi.stubEnv('AGENT_API_TOKEN', 'secret-token')
    const res = checkAgentAuth(makeReq())
    expect(res).not.toBeNull()
    expect(res!.status).toBe(401)
  })

  it('401 when Bearer scheme is missing', () => {
    vi.stubEnv('AGENT_API_TOKEN', 'secret-token')
    const res = checkAgentAuth(makeReq({ authorization: 'secret-token' }))
    expect(res).not.toBeNull()
    expect(res!.status).toBe(401)
  })

  it('401 when token does not match', () => {
    vi.stubEnv('AGENT_API_TOKEN', 'secret-token')
    const res = checkAgentAuth(makeReq({ authorization: 'Bearer wrong-token' }))
    expect(res).not.toBeNull()
    expect(res!.status).toBe(401)
  })

  it('returns null (pass) with valid Bearer token', () => {
    vi.stubEnv('AGENT_API_TOKEN', 'secret-token')
    const res = checkAgentAuth(makeReq({ authorization: 'Bearer secret-token' }))
    expect(res).toBeNull()
  })

  it('Bearer scheme is case-insensitive (e.g. "bearer ...")', () => {
    vi.stubEnv('AGENT_API_TOKEN', 'secret-token')
    const res = checkAgentAuth(makeReq({ authorization: 'bearer secret-token' }))
    expect(res).toBeNull()
  })

  it('accepts arbitrary whitespace between Bearer and token (\\s+)', () => {
    vi.stubEnv('AGENT_API_TOKEN', 'secret-token')
    const res = checkAgentAuth(makeReq({ authorization: 'Bearer    secret-token' }))
    expect(res).toBeNull()
  })
})
