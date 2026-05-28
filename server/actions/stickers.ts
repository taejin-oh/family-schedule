'use server'

import { drizzle } from 'drizzle-orm/better-sqlite3'
import { eq, and, isNull, desc, asc } from 'drizzle-orm'
import * as schema from '@/server/db/schema'
import { getDb } from '@/server/db/client'
import { evaluateToday } from '@/server/util/sticker-rules'
import { localDateIso } from '@/server/util/date'

type AppDb = ReturnType<typeof drizzle<typeof schema>>
type Ctx = { db?: AppDb }
type Result<T = void> = { ok: true; data?: T } | { ok: false; error: string }

function activeRewardRow(db: AppDb) {
  return db.select().from(schema.rewardSettings)
    .where(isNull(schema.rewardSettings.archivedAt))
    .orderBy(desc(schema.rewardSettings.createdAt))
    .limit(1)
    .get() ?? null
}

export async function getActiveReward(ctx: Ctx = {}) {
  const db = ctx.db ?? getDb()
  return activeRewardRow(db)
}

export async function setActiveReward(
  input: { name: string; emoji?: string; targetCount: number },
  ctx: Ctx = {},
): Promise<Result<{ id: number }>> {
  const name = input.name.trim()
  const emoji = (input.emoji ?? '🎁').trim() || '🎁'
  const target = Math.floor(input.targetCount)
  if (!name) return { ok: false, error: '보상 이름을 입력하세요' }
  if (!Number.isFinite(target) || target < 1) return { ok: false, error: '목표 개수는 1 이상' }
  const db = ctx.db ?? getDb()
  db.update(schema.rewardSettings).set({ archivedAt: new Date() })
    .where(isNull(schema.rewardSettings.archivedAt)).run()
  const row = db.insert(schema.rewardSettings)
    .values({ name, emoji, targetCount: target })
    .returning({ id: schema.rewardSettings.id })
    .get()
  return { ok: true, data: { id: row!.id } }
}

export async function getStickerState(ctx: Ctx = {}) {
  const db = ctx.db ?? getDb()
  const reward = activeRewardRow(db)
  const stamps = db.select().from(schema.stamps)
    .where(isNull(schema.stamps.redemptionId))
    .orderBy(asc(schema.stamps.awardedAt))
    .all()
  return {
    reward,
    stamps,
    count: stamps.length,
    target: reward?.targetCount ?? null,
    canRedeem: reward != null && stamps.length >= reward.targetCount,
  }
}

export async function listRedemptions(ctx: Ctx = {}) {
  const db = ctx.db ?? getDb()
  return db.select().from(schema.redemptions)
    .orderBy(desc(schema.redemptions.redeemedAt))
    .limit(50)
    .all()
}

export async function addManualStamp(notes?: string, ctx: Ctx = {}): Promise<Result> {
  const db = ctx.db ?? getDb()
  db.insert(schema.stamps).values({
    forDate: null,
    kind: 'manual',
    notes: notes?.trim() || null,
  }).run()
  return { ok: true }
}

/**
 * 스티커 1개 강제 삭제. 부모(설정 화면)에서만 호출 — 자동/수동 둘 다 가능.
 * 이미 보상으로 사용된(redeemed) 스티커는 보상 이력 무결성 위해 차단.
 */
export async function removeStamp(id: number, ctx: Ctx = {}): Promise<Result> {
  const db = ctx.db ?? getDb()
  const row = db.select().from(schema.stamps).where(eq(schema.stamps.id, id)).get()
  if (!row) return { ok: false, error: '스티커를 찾을 수 없습니다' }
  if (row.redemptionId !== null) return { ok: false, error: '이미 보상에 사용한 스티커' }
  db.delete(schema.stamps).where(eq(schema.stamps.id, id)).run()
  return { ok: true }
}


export async function redeem(notes?: string, ctx: Ctx = {}): Promise<Result<{ redemptionId: number; consumed: number }>> {
  const db = ctx.db ?? getDb()
  const reward = activeRewardRow(db)
  if (!reward) return { ok: false, error: '활성 보상이 없습니다' }
  const free = db.select().from(schema.stamps)
    .where(isNull(schema.stamps.redemptionId))
    .orderBy(asc(schema.stamps.awardedAt))
    .all()
  if (free.length < reward.targetCount) {
    return { ok: false, error: `스티커가 부족합니다 (${free.length}/${reward.targetCount})` }
  }
  const inserted = db.insert(schema.redemptions).values({
    rewardSettingsId: reward.id,
    rewardName: reward.name,
    rewardEmoji: reward.emoji,
    targetCount: reward.targetCount,
    notes: notes?.trim() || null,
  }).returning({ id: schema.redemptions.id }).get()
  const consumed = free.slice(0, reward.targetCount)
  for (const s of consumed) {
    db.update(schema.stamps).set({ redemptionId: inserted!.id }).where(eq(schema.stamps.id, s.id)).run()
  }
  return { ok: true, data: { redemptionId: inserted!.id, consumed: consumed.length } }
}

/**
 * Called from toggleItemDone / markRecurring(Un)done hooks.
 * If today is cleared and at least one item existed today → insert auto stamp.
 * If today became un-cleared (undo) → revoke today's unredeemed auto stamp.
 * Errors are swallowed so the primary action isn't disrupted.
 */
export async function tryStampToday(ctx: Ctx = {}): Promise<void> {
  const db = ctx.db ?? getDb()
  const todayIso = localDateIso()
  try {
    const ev = evaluateToday(db)
    if (ev.hadAny && ev.allDone) {
      try {
        db.insert(schema.stamps).values({ forDate: todayIso, kind: 'auto' }).run()
      } catch {
        // UNIQUE on for_date — already stamped today
      }
    } else {
      db.delete(schema.stamps)
        .where(and(
          eq(schema.stamps.forDate, todayIso),
          eq(schema.stamps.kind, 'auto'),
          isNull(schema.stamps.redemptionId),
        ))
        .run()
    }
  } catch (e) {
    console.error('[stickers] tryStampToday failed:', e)
  }
}
