const TELEGRAM_TIMEOUT_MS = 10_000

/** 에러 메시지에 봇 토큰이 우연히 포함된 경우(undici가 URL을 stack/cause에
 *  넣는 사례 대비) 토큰을 '***'로 치환해 reason 노출 표면을 줄인다. */
function maskToken(msg: string, token: string): string {
  if (!token) return msg
  return msg.split(token).join('***')
}

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
    const raw = e instanceof Error ? e.message : String(e)
    return { ok: false, reason: maskToken(raw, token) }
  } finally {
    clearTimeout(timer)
  }
}
