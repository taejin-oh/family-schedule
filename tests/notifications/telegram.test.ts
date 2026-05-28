import { describe, it, expect, vi, afterEach } from 'vitest'

// We import the module under test dynamically so we can control env vars per test
async function loadSendTelegram() {
  const mod = await import('@/server/notifications/telegram')
  return mod.sendTelegram
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('sendTelegram', () => {
  it('returns not-configured when TOKEN is missing', async () => {
    vi.stubEnv('TELEGRAM_BOT_TOKEN', '')
    vi.stubEnv('TELEGRAM_CHAT_ID', 'chat123')
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const sendTelegram = await loadSendTelegram()
    const result = await sendTelegram('hello')

    expect(result.ok).toBe(false)
    expect(result.reason).toBe('not-configured')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns not-configured when CHAT_ID is missing', async () => {
    vi.stubEnv('TELEGRAM_BOT_TOKEN', 'some-token')
    vi.stubEnv('TELEGRAM_CHAT_ID', '')
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const sendTelegram = await loadSendTelegram()
    const result = await sendTelegram('hello')

    expect(result.ok).toBe(false)
    expect(result.reason).toBe('not-configured')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('calls the correct Bot API URL and body', async () => {
    vi.stubEnv('TELEGRAM_BOT_TOKEN', 'token123')
    vi.stubEnv('TELEGRAM_CHAT_ID', '-1001234567890')
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchMock)

    const sendTelegram = await loadSendTelegram()
    const result = await sendTelegram('<b>테스트</b>')

    expect(result.ok).toBe(true)
    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, opts] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.telegram.org/bottoken123/sendMessage')
    expect(opts.method).toBe('POST')
    const body = JSON.parse(opts.body)
    expect(body.chat_id).toBe('-1001234567890')
    expect(body.text).toBe('<b>테스트</b>')
    expect(body.parse_mode).toBe('HTML')
    expect(body.disable_web_page_preview).toBe(true)
  })

  it('returns ok:false with reason on HTTP 400', async () => {
    vi.stubEnv('TELEGRAM_BOT_TOKEN', 'token123')
    vi.stubEnv('TELEGRAM_CHAT_ID', '-100')
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 400 })
    vi.stubGlobal('fetch', fetchMock)

    const sendTelegram = await loadSendTelegram()
    const result = await sendTelegram('hello')

    expect(result.ok).toBe(false)
    expect(result.reason).toBe('http 400')
  })

  it('masks the bot token if it leaks into a thrown error message', async () => {
    // undici/proxy 환경에서 fetch가 error.message에 URL을 포함하는 경우 대비.
    // 토큰이 reason으로 전파되지 않아야 한다.
    const SECRET = 'verySecretToken_8957302092:AAG_test'
    vi.stubEnv('TELEGRAM_BOT_TOKEN', SECRET)
    vi.stubEnv('TELEGRAM_CHAT_ID', '-100')

    const fetchMock = vi.fn().mockRejectedValue(
      new Error(`fetch failed for https://api.telegram.org/bot${SECRET}/sendMessage`),
    )
    vi.stubGlobal('fetch', fetchMock)

    const sendTelegram = await loadSendTelegram()
    const result = await sendTelegram('hello')

    expect(result.ok).toBe(false)
    expect(result.reason).toBeDefined()
    expect(result.reason).not.toContain(SECRET)
    expect(result.reason).toContain('***')
  })

  it('AbortError stays as "timeout" reason (no token to mask there)', async () => {
    vi.stubEnv('TELEGRAM_BOT_TOKEN', 'token123')
    vi.stubEnv('TELEGRAM_CHAT_ID', '-100')

    const abortErr = new Error('aborted')
    abortErr.name = 'AbortError'
    const fetchMock = vi.fn().mockRejectedValue(abortErr)
    vi.stubGlobal('fetch', fetchMock)

    const sendTelegram = await loadSendTelegram()
    const result = await sendTelegram('hello')

    expect(result.ok).toBe(false)
    expect(result.reason).toBe('timeout')
  })
})
