const TELEGRAM_TIMEOUT_MS = 10_000

export async function sendTelegram(text: string): Promise<{ ok: boolean; reason?: string }> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_CHAT_ID
  if (!token || !chatId) {
    console.log('[telegram] not configured — skipping send')
    return { ok: false, reason: 'not-configured' }
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TELEGRAM_TIMEOUT_MS)
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
      signal: controller.signal,
    })
    if (!res.ok) {
      return { ok: false, reason: `http ${res.status}` }
    }
    return { ok: true }
  } catch (e: unknown) {
    if (e instanceof Error && e.name === 'AbortError') {
      return { ok: false, reason: 'timeout' }
    }
    return { ok: false, reason: e instanceof Error ? e.message : String(e) }
  } finally {
    clearTimeout(timer)
  }
}
