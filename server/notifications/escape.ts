/**
 * Telegram parse_mode='HTML' 메시지에 사용자 입력을 끼울 때 사용.
 * Telegram은 `& < >` 만 escape하면 충분 — quote는 attribute 컨텍스트가
 * 없으므로 보호 불필요.
 */
export function escTelegramHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
