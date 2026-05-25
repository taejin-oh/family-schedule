'use server'

import { drizzle } from 'drizzle-orm/better-sqlite3'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import * as schema from '@/server/db/schema'
import { getDb } from '@/server/db/client'
import { availableProviderNames, getProvider } from '@/server/llm/registry'
import { revalidatePath } from 'next/cache'

type AppDb = ReturnType<typeof drizzle<typeof schema>>
type Ctx = { appDb?: AppDb }

export async function getSettings(ctx: Ctx = {}) {
  const db = ctx.appDb ?? getDb()
  const row = db.select().from(schema.appSettings).where(eq(schema.appSettings.id, 1)).get()
  return row ?? { id: 1, visionProvider: 'claude', visionModel: 'claude-opus-4-7' }
}

const Input = z.object({
  visionProvider: z.string(),
  visionModel: z.string(),
})

export async function updateSettings(input: z.infer<typeof Input>, ctx: Ctx = {}): Promise<{ ok: boolean; error?: string }> {
  const parsed = Input.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'invalid' }
  if (!availableProviderNames().includes(parsed.data.visionProvider)) {
    return { ok: false, error: `알 수 없는 provider: ${parsed.data.visionProvider}` }
  }
  const provider = getProvider(parsed.data.visionProvider)
  if (!(provider.availableModels as readonly string[]).includes(parsed.data.visionModel)) {
    return { ok: false, error: `${parsed.data.visionProvider}에서 사용할 수 없는 모델: ${parsed.data.visionModel}` }
  }
  const db = ctx.appDb ?? getDb()
  db.update(schema.appSettings).set(parsed.data).where(eq(schema.appSettings.id, 1)).run()
  revalidatePath('/admin/settings')
  return { ok: true }
}

export async function listProviderOptions() {
  return availableProviderNames().map((n) => {
    const p = getProvider(n)
    return { name: n, models: p.availableModels.slice(), defaultModel: p.defaultModel }
  })
}
