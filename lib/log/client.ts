'use client'

/**
 * Client-side analytics helper. 클라 이벤트를 /api/log로 fire-and-forget 전송.
 *
 * - session_id: 첫 호출 시 발급, localStorage + cookie 동시 저장. 무기한 (5년)으로
 *   같은 device/브라우저에서 분석 연속성 확보. 가족 멤버는 구분 안 함.
 * - sendBeacon 우선 — page unload/transition 시에도 송신 안전. 없으면 keepalive fetch.
 * - 실패는 silent. UI 영향 0.
 */

const STORAGE_KEY = 'fs_session_id'
const COOKIE_NAME = 'fs_session_id'
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365 * 5

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null
  const m = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/[-.+*?^$(){}|[\]\\]/g, '\\$&') + '=([^;]*)'))
  return m ? decodeURIComponent(m[1]) : null
}

function writeCookie(name: string, value: string, maxAgeSec: number) {
  if (typeof document === 'undefined') return
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAgeSec}; SameSite=Lax`
}

function genId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  } catch {}
  return `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}

// Module-level cache — 매 track() 호출마다 cookie/localStorage write 반복하지 않도록.
// 첫 호출에 발급/조회 후 lifetime 동안 in-memory reuse. 5년 max-age라 expiry refresh 불필요.
let _cachedSessionId: string | null = null

export function getSessionId(): string {
  if (typeof window === 'undefined') return ''
  if (_cachedSessionId) return _cachedSessionId
  let id: string | null = null
  try {
    id = window.localStorage.getItem(STORAGE_KEY)
  } catch {}
  if (!id) {
    id = readCookie(COOKIE_NAME) ?? genId()
    try { window.localStorage.setItem(STORAGE_KEY, id) } catch {}
  }
  writeCookie(COOKIE_NAME, id, COOKIE_MAX_AGE)
  _cachedSessionId = id
  return id
}

export type TrackProps = Record<string, unknown>

export function track(category: 'navigation' | 'interaction' | 'mutation' | 'error' | 'perf' | 'feature', event: string, props?: TrackProps): void {
  if (typeof window === 'undefined') return
  try {
    const body = JSON.stringify({
      category,
      event,
      props: props ?? undefined,
      sessionId: getSessionId(),
      path: window.location.pathname,
    })
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      const blob = new Blob([body], { type: 'application/json' })
      navigator.sendBeacon('/api/log', blob)
      return
    }
    fetch('/api/log', {
      method: 'POST',
      body,
      headers: { 'content-type': 'application/json' },
      keepalive: true,
    }).catch(() => {})
  } catch {
    // silent
  }
}
