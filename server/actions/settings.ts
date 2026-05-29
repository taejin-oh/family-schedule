'use server'

import { drizzle } from 'drizzle-orm/better-sqlite3'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import * as schema from '@/server/db/schema'
import { getDb } from '@/server/db/client'
import { availableProviderNames, getProvider } from '@/server/llm/registry'
import { revalidatePath } from 'next/cache'
import { sendTelegram } from '@/server/notifications/telegram'
import { logServerEvent } from '@/server/log/server-event'

type AppDb = ReturnType<typeof drizzle<typeof schema>>
type Ctx = { appDb?: AppDb }

export async function getSettings(ctx: Ctx = {}) {
  const db = ctx.appDb ?? getDb()
  const row = db.select().from(schema.appSettings).where(eq(schema.appSettings.id, 1)).get()
  return row ?? {
    id: 1,
    visionProvider: 'claude',
    visionModel: 'claude-opus-4-8',
    telegramEnabled: false,
    telegramMorningEnabled: true,
    telegramMorningTime: '07:00',
    telegramEveningEnabled: true,
    telegramEveningTime: '21:00',
    telegramMiddayEnabled: true,
    telegramMiddayTime: '12:00',
    telegramAcademyReminderEnabled: true,
    telegramAcademyReminderMinutes: 10,
  }
}

const timeHHMM = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, '00:00–23:59 범위의 HH:MM 형식이어야 합니다')

const Input = z.object({
  visionProvider: z.string(),
  visionModel: z.string(),
  telegramEnabled: z.boolean().optional(),
  telegramMorningEnabled: z.boolean().optional(),
  telegramMorningTime: timeHHMM.optional(),
  telegramEveningEnabled: z.boolean().optional(),
  telegramEveningTime: timeHHMM.optional(),
  telegramMiddayEnabled: z.boolean().optional(),
  telegramMiddayTime: timeHHMM.optional(),
  telegramAcademyReminderEnabled: z.boolean().optional(),
  telegramAcademyReminderMinutes: z.coerce.number().int().min(1).max(60).optional(),
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
  // caller가 _실제로 보낸_ 필드만 추출 (zod optional이라 parsed.data는 undefined 키도 포함).
  const changedFields = (Object.keys(input) as Array<keyof typeof input>).filter((k) => input[k] !== undefined)
  await logServerEvent({ category: 'mutation', event: 'settings.update', props: { provider: parsed.data.visionProvider, model: parsed.data.visionModel, fields: changedFields } })
  return { ok: true }
}

export async function listProviderOptions() {
  return availableProviderNames().map((n) => {
    const p = getProvider(n)
    return { name: n, models: p.availableModels.slice(), defaultModel: p.defaultModel }
  })
}

export async function sendTestTelegram(): Promise<{ ok: boolean; reason?: string }> {
  const res = await sendTelegram('🔧 family-schedule 테스트 메시지')
  await logServerEvent({ category: 'feature', event: 'telegram.test_sent', props: { ok: res.ok, reason: res.reason } })
  return res
}
