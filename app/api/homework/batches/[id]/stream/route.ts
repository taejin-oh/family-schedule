import { eq } from 'drizzle-orm'
import { getDb } from '@/server/db/client'
import * as schema from '@/server/db/schema'

export const dynamic = 'force-dynamic'

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const batchId = Number(id)
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      let last = ''
      let cancelled = false
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
      const handle = setInterval(() => {
        if (tick()) {
          clearInterval(handle)
          try { controller.close() } catch {}
        }
      }, 700)
      // Allow client disconnect to stop the polling loop.
      ;(controller as any)._cancelHandle = handle
    },
    cancel() {
      // ReadableStream cancel — set the cancelled flag so the next tick stops
      // (the interval is cleared from inside tick when status terminal or cancelled).
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
