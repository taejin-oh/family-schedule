import { eq } from 'drizzle-orm'
import { getDb } from '@/server/db/client'
import * as schema from '@/server/db/schema'

export const dynamic = 'force-dynamic'

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const batchId = Number(id)
  const encoder = new TextEncoder()
  let handle: ReturnType<typeof setInterval> | null = null
  let cancelled = false
  const stream = new ReadableStream({
    async start(controller) {
      let last = ''
      const tick = () => {
        if (cancelled) return true
        const row = getDb().select().from(schema.homeworkBatches).where(eq(schema.homeworkBatches.id, batchId)).get()
        if (!row) {
          try { controller.enqueue(encoder.encode(`event: error\ndata: not found\n\n`)) } catch {}
          try { controller.close() } catch {}
          return true
        }
        const payload = JSON.stringify({ status: row.status, failureReason: row.failureReason ?? null })
        if (payload !== last) {
          try { controller.enqueue(encoder.encode(`data: ${payload}\n\n`)) } catch {}
          last = payload
        }
        return row.status === 'ready' || row.status === 'committed' || row.status === 'failed'
      }
      if (tick()) { try { controller.close() } catch {}; return }
      handle = setInterval(() => {
        if (tick()) {
          if (handle) { clearInterval(handle); handle = null }
          try { controller.close() } catch {}
        }
      }, 700)
    },
    cancel() {
      cancelled = true
      if (handle) { clearInterval(handle); handle = null }
    },
  })
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
