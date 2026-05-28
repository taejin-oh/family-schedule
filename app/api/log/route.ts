import { NextResponse } from 'next/server'
import { logEvent, ALLOWED_CATEGORIES, type EventCategory } from '@/server/log/events'

/**
 * POST /api/log
 * Body: { category, event, props?, sessionId?, path? }
 *
 * - 가족 LAN 환경. 인증 없음. 화이트리스트로 noise 차단.
 * - 절대로 caller에 throw하지 않음. 클라 이벤트 송신은 fire-and-forget.
 * - sendBeacon 호환: body는 text/JSON 둘 다 받음.
 */

const MAX_BODY_BYTES = 16 * 1024
const MAX_EVENT_LEN = 128       // event 이름은 한 문자열 안에서 짧게 (e.g. "homework.create")
const ALLOWED = new Set<string>(ALLOWED_CATEGORIES)

export async function POST(req: Request) {
  try {
    const raw = await req.text()
    if (raw.length > MAX_BODY_BYTES) {
      return NextResponse.json({ ok: false }, { status: 413 })
    }
    let data: unknown
    try {
      data = JSON.parse(raw)
    } catch {
      return NextResponse.json({ ok: false }, { status: 400 })
    }
    if (!data || typeof data !== 'object') {
      return NextResponse.json({ ok: false }, { status: 400 })
    }
    const d = data as Record<string, unknown>
    const category = typeof d.category === 'string' ? d.category : ''
    const event = typeof d.event === 'string' ? d.event : ''
    // category 화이트리스트 + event 길이 제한.
    // LAN 손님 기기가 임의 event 문자열 폭주로 events 테이블 폴루션하는 표면 방어.
    if (!ALLOWED.has(category) || !event || event.length > MAX_EVENT_LEN) {
      return NextResponse.json({ ok: false }, { status: 400 })
    }

    logEvent({
      category: category as EventCategory,
      event,
      props: d.props && typeof d.props === 'object' ? (d.props as Record<string, unknown>) : null,
      sessionId: typeof d.sessionId === 'string' ? d.sessionId : null,
      path: typeof d.path === 'string' ? d.path : null,
      userAgent: req.headers.get('user-agent'),
    })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
