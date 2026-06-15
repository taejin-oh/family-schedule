'use server'

import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { getDb } from '@/server/db/client'
import * as schema from '@/server/db/schema'
import { DEFAULT_EMPTY_STATES, type EmptyState } from '@/lib/empty-states'
import { logServerEvent } from '@/server/log/server-event'

const MAX_ITEMS = 200
const MAX_EMOJI = 8
const MAX_TITLE = 80
const MAX_SUB = 80

function sanitize(items: unknown[]): EmptyState[] {
  return items
    .map((raw) => {
      if (!raw || typeof raw !== 'object') return null
      const r = raw as Record<string, unknown>
      const emoji = String(r.emoji ?? '').slice(0, MAX_EMOJI).trim()
      const title = String(r.title ?? '').slice(0, MAX_TITLE).trim()
      const sub = String(r.sub ?? '').slice(0, MAX_SUB).trim()
      if (!title) return null
      return { emoji, title, sub }
    })
    .filter((x): x is EmptyState => x !== null)
}

export async function getEmptyStates(): Promise<EmptyState[]> {
  const db = getDb()
  const row = db.select().from(schema.appSettings).where(eq(schema.appSettings.id, 1)).get()
  const stored = row?.emptyStateCopy
  if (!Array.isArray(stored) || stored.length === 0) {
    return [...DEFAULT_EMPTY_STATES]
  }
  const valid = sanitize(stored)
  return valid.length > 0 ? valid : [...DEFAULT_EMPTY_STATES]
}

export async function updateEmptyStates(
  items: EmptyState[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!Array.isArray(items)) return { ok: false, error: '잘못된 형식입니다.' }
  if (items.length > MAX_ITEMS) return { ok: false, error: `최대 ${MAX_ITEMS}개까지만 가능합니다.` }
  const clean = sanitize(items)
  if (clean.length === 0) return { ok: false, error: '제목이 비어있지 않은 항목이 최소 1개 필요합니다.' }

  const db = getDb()
  db.update(schema.appSettings)
    .set({ emptyStateCopy: clean })
    .where(eq(schema.appSettings.id, 1))
    .run()
  revalidatePath('/kids')
  revalidatePath('/admin/empty-states')
  await logServerEvent({ category: 'mutation', event: 'empty_states.update', props: { count: clean.length } })
  return { ok: true }
}

export async function resetEmptyStatesToDefault(): Promise<{ ok: true }> {
  const db = getDb()
  db.update(schema.appSettings)
    .set({ emptyStateCopy: null })
    .where(eq(schema.appSettings.id, 1))
    .run()
  revalidatePath('/kids')
  revalidatePath('/admin/empty-states')
  await logServerEvent({ category: 'mutation', event: 'empty_states.reset' })
  return { ok: true }
}
