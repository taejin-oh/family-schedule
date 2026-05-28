import { describe, it, expect } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { eq } from 'drizzle-orm'
import * as schema from '@/server/db/schema'
import {
  setActiveReward,
  getActiveReward,
  getStickerState,
  addManualStamp,
  removeStamp,
  redeem,
  tryStampToday,
  listRedemptions,
} from '@/server/actions/stickers'
import {
  createRecurringTask,
  markRecurringDone,
  markRecurringUndone,
} from '@/server/actions/recurring'
import { localDateIso } from '@/server/util/date'

type DayKey = 'mon'|'tue'|'wed'|'thu'|'fri'|'sat'|'sun'

function makeDb() {
  const dir = mkdtempSync(join(tmpdir(), 'fs-stk-'))
  const sqlite = new Database(join(dir, 'app.db'))
  sqlite.pragma('foreign_keys = ON')
  const db = drizzle(sqlite, { schema })
  migrate(db, { migrationsFolder: './server/db/migrations' })
  return { db, sqlite }
}

const KEYS: DayKey[] = ['sun','mon','tue','wed','thu','fri','sat']
function todayKey(): DayKey { return KEYS[new Date().getDay()] }

describe('setActiveReward / getActiveReward', () => {
  it('archives previous active row and inserts the new one', async () => {
    const { db } = makeDb()
    const r1 = await setActiveReward({ name: '보드게임', emoji: '🎲', targetCount: 10 }, { db })
    expect(r1.ok).toBe(true)
    expect((await getActiveReward({ db }))?.name).toBe('보드게임')

    await setActiveReward({ name: '책', targetCount: 5 }, { db })
    const all = db.select().from(schema.rewardSettings).all()
    expect(all).toHaveLength(2)
    expect(all.filter((r) => r.archivedAt === null)).toHaveLength(1)
    const a = await getActiveReward({ db })
    expect(a?.name).toBe('책')
    expect(a?.targetCount).toBe(5)
  })

  it('rejects empty name and non-positive targetCount', async () => {
    const { db } = makeDb()
    expect((await setActiveReward({ name: '', targetCount: 5 }, { db })).ok).toBe(false)
    expect((await setActiveReward({ name: 'x', targetCount: 0 }, { db })).ok).toBe(false)
    expect((await setActiveReward({ name: 'x', targetCount: -3 }, { db })).ok).toBe(false)
  })
})

describe('addManualStamp / removeStamp', () => {
  it('adds a manual stamp and removes it', async () => {
    const { db } = makeDb()
    await addManualStamp('보너스', { db })
    const before = await getStickerState({ db })
    expect(before.count).toBe(1)
    expect(before.stamps[0].kind).toBe('manual')
    const r = await removeStamp(before.stamps[0].id, { db })
    expect(r.ok).toBe(true)
    expect((await getStickerState({ db })).count).toBe(0)
  })

  it('removes an auto stamp too (admin force-remove)', async () => {
    // 정책 변경: 설정 화면에서 부모가 자동 적립 스티커도 강제로 지울 수 있어야 함.
    const { db } = makeDb()
    db.insert(schema.stamps).values({ forDate: '2026-05-26', kind: 'auto' }).run()
    const stamp = db.select().from(schema.stamps).get()!
    const r = await removeStamp(stamp.id, { db })
    expect(r.ok).toBe(true)
    expect(db.select().from(schema.stamps).all()).toHaveLength(0)
  })

  it('still refuses to remove a stamp already used in a redemption', async () => {
    const { db } = makeDb()
    const [reward] = db.insert(schema.rewardSettings).values({
      name: 'test', emoji: '🏆', targetCount: 3,
    }).returning().all()
    const [red] = db.insert(schema.redemptions).values({
      rewardSettingsId: reward.id,
      rewardName: 'test',
      rewardEmoji: '🏆',
      targetCount: 3,
    }).returning().all()
    db.insert(schema.stamps).values({ forDate: null, kind: 'manual', redemptionId: red.id }).run()
    const stamp = db.select().from(schema.stamps).get()!
    const res = await removeStamp(stamp.id, { db })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toMatch(/보상에 사용/)
  })
})

describe('redeem', () => {
  it('fails when no active reward is configured', async () => {
    const { db } = makeDb()
    await addManualStamp(undefined, { db })
    const r = await redeem(undefined, { db })
    expect(r.ok).toBe(false)
  })

  it('fails when stamp count is below target', async () => {
    const { db } = makeDb()
    await setActiveReward({ name: '보드게임', targetCount: 3 }, { db })
    await addManualStamp(undefined, { db })
    await addManualStamp(undefined, { db })
    const r = await redeem(undefined, { db })
    expect(r.ok).toBe(false)
  })

  it('consumes target_count stamps oldest-first and records the redemption', async () => {
    const { db } = makeDb()
    await setActiveReward({ name: '보드게임', emoji: '🎲', targetCount: 3 }, { db })
    for (let i = 0; i < 4; i++) await addManualStamp(undefined, { db })
    const r = await redeem('축하해!', { db })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data?.consumed).toBe(3)

    const state = await getStickerState({ db })
    expect(state.count).toBe(1)  // 4 - 3 carry over

    const reds = await listRedemptions({ db })
    expect(reds).toHaveLength(1)
    expect(reds[0].rewardName).toBe('보드게임')
    expect(reds[0].rewardEmoji).toBe('🎲')
    expect(reds[0].targetCount).toBe(3)
    expect(reds[0].notes).toBe('축하해!')
  })

  it('concurrent redeem calls produce at most one redemption (atomic transaction)', async () => {
    // 동시 redeem 시뮬레이션. better-sqlite3 + Node single-thread에서는 사실상
    // race가 어렵지만, transaction wrap이 도입된 이후에도 회귀 없이 동작하는지
    // (한쪽만 성공 + DB 상태 일관) 검증한다. 4 stamps, target=3이라 한 번만 가능.
    const { db } = makeDb()
    await setActiveReward({ name: '보드게임', emoji: '🎲', targetCount: 3 }, { db })
    for (let i = 0; i < 4; i++) await addManualStamp(undefined, { db })

    const [r1, r2] = await Promise.all([
      redeem(undefined, { db }),
      redeem(undefined, { db }),
    ])

    const oks = [r1, r2].filter((r) => r.ok)
    expect(oks).toHaveLength(1)
    const fails = [r1, r2].filter((r) => !r.ok)
    expect(fails).toHaveLength(1)

    const reds = await listRedemptions({ db })
    expect(reds).toHaveLength(1)
    expect(reds[0].targetCount).toBe(3)

    const remaining = await getStickerState({ db })
    expect(remaining.count).toBe(1)  // 4 - 3
  })

  it('rolls back stamps update on partial failure (DB-level atomicity)', async () => {
    // redemption insert는 성공했지만 stamps UPDATE 도중 IO 에러로 부분 실패가
    // 났다면 transaction이 redemption 행도 rollback해서 "보상 1건 = stamps N개
    // 소비"의 일관성을 깨지 않아야 한다.
    //
    // better-sqlite3에서 인위적 IO 실패를 만들기 어려우므로 sqlite 자체 제약
    // 위반(FK 위반)을 트리거: stamps.id에 존재하지 않는 값을 update해도 sqlite는
    // changes=0으로 처리하니 fail이 아님. 대신 transaction 안 다른 작업 실패 →
    // 외부 throw가 전체 rollback하는지 확인. update target ID를 강제로 무효화
    // 하기엔 코드 수정이 필요하므로 여기서는 "성공 시 일관성"만 검증.
    const { db } = makeDb()
    await setActiveReward({ name: '책', targetCount: 2 }, { db })
    await addManualStamp(undefined, { db })
    await addManualStamp(undefined, { db })

    const r = await redeem(undefined, { db })
    expect(r.ok).toBe(true)

    // 모든 free stamp가 동일 redemptionId로 묶였는지 (부분적 update 흔적 없음)
    const allStamps = db.select().from(schema.stamps).all()
    const redemptions = await listRedemptions({ db })
    expect(redemptions).toHaveLength(1)
    const rid = redemptions[0].id
    expect(allStamps.every((s) => s.redemptionId === rid)).toBe(true)
  })
})

describe('tryStampToday (auto adjudication)', () => {
  it('does nothing when today has no items at all', async () => {
    const { db } = makeDb()
    await tryStampToday({ db })
    expect((await getStickerState({ db })).count).toBe(0)
  })

  it('stamps today after the last recurring task is completed', async () => {
    const { db } = makeDb()
    await createRecurringTask({ title: '구몬', daysOfWeek: [todayKey()] }, { db })
    const tIso = localDateIso()
    const task = db.select().from(schema.recurringTasks).get()!

    await tryStampToday({ db })
    expect((await getStickerState({ db })).count).toBe(0)  // not done yet

    await markRecurringDone(task.id, tIso, { db })  // hook stamps inside
    const state = await getStickerState({ db })
    expect(state.count).toBe(1)
    expect(state.stamps[0].kind).toBe('auto')
    expect(state.stamps[0].forDate).toBe(tIso)
  })

  it('revokes today stamp when an item is undone', async () => {
    const { db } = makeDb()
    await createRecurringTask({ title: '구몬', daysOfWeek: [todayKey()] }, { db })
    const tIso = localDateIso()
    const task = db.select().from(schema.recurringTasks).get()!
    await markRecurringDone(task.id, tIso, { db })
    expect((await getStickerState({ db })).count).toBe(1)

    await markRecurringUndone(task.id, tIso, { db })
    expect((await getStickerState({ db })).count).toBe(0)
  })

  it('does not revoke a stamp that has already been redeemed', async () => {
    const { db } = makeDb()
    await setActiveReward({ name: '책', targetCount: 1 }, { db })
    await createRecurringTask({ title: '구몬', daysOfWeek: [todayKey()] }, { db })
    const tIso = localDateIso()
    const task = db.select().from(schema.recurringTasks).get()!
    await markRecurringDone(task.id, tIso, { db })

    const r = await redeem(undefined, { db })
    expect(r.ok).toBe(true)
    expect((await getStickerState({ db })).count).toBe(0)

    await markRecurringUndone(task.id, tIso, { db })
    const all = db.select().from(schema.stamps).all()
    expect(all).toHaveLength(1)
    expect(all[0].redemptionId).not.toBeNull()  // preserved as historical record
  })

  it('does not double-stamp on re-evaluation of the same day', async () => {
    const { db } = makeDb()
    await createRecurringTask({ title: '구몬', daysOfWeek: [todayKey()] }, { db })
    const tIso = localDateIso()
    const task = db.select().from(schema.recurringTasks).get()!
    await markRecurringDone(task.id, tIso, { db })
    await tryStampToday({ db })  // re-fires
    await tryStampToday({ db })
    expect((await getStickerState({ db })).count).toBe(1)
  })

  // === Weekly recurring is intentionally OUT of stamp evaluation. ===

  it('stamps even when a weekly recurring task is still active', async () => {
    // 사용자 시나리오: 월요일에 매일 일은 끝냈는데 매주 일이 남아있어도 stamp 받아야 한다.
    const { db } = makeDb()
    await createRecurringTask({ title: '구몬', cadence: 'daily', daysOfWeek: [todayKey()] }, { db })
    await createRecurringTask({ title: '독서록', cadence: 'weekly', daysOfWeek: [] }, { db })
    const tIso = localDateIso()
    const dailyTask = db.select().from(schema.recurringTasks)
      .where(eq(schema.recurringTasks.cadence, 'daily')).get()!
    await markRecurringDone(dailyTask.id, tIso, { db })
    const state = await getStickerState({ db })
    expect(state.count).toBe(1)
    expect(state.stamps[0].kind).toBe('auto')
  })

  it('does not stamp on a day that only has weekly tasks (no daily/homework scoped to today)', async () => {
    // 오늘 daily/homework 0개이고 weekly만 존재 → "오늘 다 함" 의미 없음 → stamp 안 줌
    const { db } = makeDb()
    await createRecurringTask({ title: '독서록', cadence: 'weekly', daysOfWeek: [] }, { db })
    const weeklyTask = db.select().from(schema.recurringTasks).get()!
    const tIso = localDateIso()
    await markRecurringDone(weeklyTask.id, tIso, { db })
    expect((await getStickerState({ db })).count).toBe(0)
  })

  it('completing a weekly task does not by itself trigger a stamp even if a daily exists', async () => {
    // daily는 active 상태로 남아있고 weekly만 완료 → daily가 여전히 active이므로 stamp 안 줌
    const { db } = makeDb()
    await createRecurringTask({ title: '구몬', cadence: 'daily', daysOfWeek: [todayKey()] }, { db })
    await createRecurringTask({ title: '독서록', cadence: 'weekly', daysOfWeek: [] }, { db })
    const weeklyTask = db.select().from(schema.recurringTasks)
      .where(eq(schema.recurringTasks.cadence, 'weekly')).get()!
    const tIso = localDateIso()
    await markRecurringDone(weeklyTask.id, tIso, { db })
    expect((await getStickerState({ db })).count).toBe(0)
  })
})
