/**
 * Shared-secret 인증 helper for `/api/agent/*` 라우트들.
 *
 * OpenClaw 같은 외부 agent가 family-schedule 데이터를 read할 때 사용.
 * 사용자 브라우저 + Cloudflare Access 경로는 이 API를 안 거치고 직접 DB.
 *
 * 토큰은 `.env`의 `AGENT_API_TOKEN`. 없으면 모든 요청 거부 (안전 기본).
 */

import { NextResponse } from 'next/server'

export function checkAgentAuth(req: Request): NextResponse | null {
  const expected = process.env.AGENT_API_TOKEN
  if (!expected) {
    return NextResponse.json({ error: 'agent api not configured' }, { status: 503 })
  }
  const header = req.headers.get('authorization')
  if (!header) {
    return NextResponse.json({ error: 'missing authorization' }, { status: 401 })
  }
  const match = header.match(/^Bearer\s+(.+)$/i)
  if (!match || match[1] !== expected) {
    return NextResponse.json({ error: 'invalid token' }, { status: 401 })
  }
  return null
}
