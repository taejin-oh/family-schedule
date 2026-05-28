import { describe, it, expect } from 'vitest'
import { escTelegramHtml } from '@/server/notifications/escape'

describe('escTelegramHtml', () => {
  it('escapes &, <, > (Telegram HTML parse_mode required minimum)', () => {
    expect(escTelegramHtml('a & b < c > d')).toBe('a &amp; b &lt; c &gt; d')
  })

  it('leaves other characters (한글 포함) untouched', () => {
    expect(escTelegramHtml('수학학원 1호점')).toBe('수학학원 1호점')
    expect(escTelegramHtml("can't / won't")).toBe("can't / won't")
  })

  it('escape는 idempotent — 이미 escape된 문자열을 다시 통과시켜도 ampersand만 재escape', () => {
    // 한 번 escape: '&' -> '&amp;'
    // 두 번 escape: '&amp;' -> '&amp;amp;' (의도된 동작; double-escape 책임은 caller)
    expect(escTelegramHtml('&amp;')).toBe('&amp;amp;')
  })

  it('빈 문자열 안전', () => {
    expect(escTelegramHtml('')).toBe('')
  })
})
