import 'server-only'
import { cookies } from 'next/headers'
import { logEvent, type LogEventInput } from './events'

/**
 * Server action / route handler 안에서 호출. cookies()로 fs_session_id 자동 주입.
 * jobs/worker처럼 request 컨텍스트가 없는 곳에서 호출하면 sessionId가 null.
 * 어떤 경우든 caller에 throw하지 않음.
 */
export async function logServerEvent(input: Omit<LogEventInput, 'sessionId'>): Promise<void> {
  let sessionId: string | null = null
  try {
    const c = await cookies()
    sessionId = c.get('fs_session_id')?.value ?? null
  } catch {
    // not in a request context — keep null
  }
  logEvent({ ...input, sessionId })
}
