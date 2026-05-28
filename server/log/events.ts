import 'server-only'
import { getDb } from '@/server/db/client'
import * as schema from '@/server/db/schema'
import { localDateIso } from '@/server/util/date'

/**
 * 가족 사용 패턴 / 실수 / 수정 추적용 이벤트 로깅.
 *
 * - 외부 송신 0. 로컬 sqlite의 events 테이블에만 INSERT.
 * - props는 메타데이터만 (실제 텍스트 X). 한 row 8KB cap.
 * - 어떤 이유로든 logEvent가 실패해도 caller에 영향 없음 (silent error).
 * - local_date는 서버 timezone 기준 YYYY-MM-DD로 미리 계산 — 분석 쿼리에서
 *   epoch→local 변환 회피.
 */

export const ALLOWED_CATEGORIES = ['navigation', 'interaction', 'mutation', 'error', 'perf', 'feature'] as const
export type EventCategory = typeof ALLOWED_CATEGORIES[number]
const CATEGORY_SET = new Set<string>(ALLOWED_CATEGORIES)

const PROPS_CAP_BYTES = 8 * 1024

export type LogEventInput = {
  category: EventCategory
  event: string
  props?: Record<string, unknown> | null
  sessionId?: string | null
  path?: string | null
  userAgent?: string | null
  /** override timestamp (테스트 전용) */
  ts?: number
}

type Ctx = { appDb?: ReturnType<typeof getDb> }

export function logEvent(input: LogEventInput, ctx: Ctx = {}): void {
  try {
    if (!CATEGORY_SET.has(input.category)) return
    if (!input.event || typeof input.event !== 'string') return

    const ts = input.ts ?? Date.now()
    const localDate = localDateIso(new Date(ts))

    let propsJson: string | null = null
    if (input.props && typeof input.props === 'object') {
      const s = JSON.stringify(input.props)
      if (s.length <= PROPS_CAP_BYTES) propsJson = s
    }

    const db = ctx.appDb ?? getDb()
    db.insert(schema.events).values({
      ts,
      localDate,
      sessionId: input.sessionId ?? null,
      category: input.category,
      event: input.event,
      propsJson,
      path: input.path ?? null,
      userAgent: input.userAgent ?? null,
    }).run()
  } catch (e) {
    console.error('[log] logEvent failed', e)
  }
}
