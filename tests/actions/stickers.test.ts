import { describe, it, expect } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import * as schema from '@/server/db/schema'
import {
  setActiveReward,
  getActiveReward,
  getStickerState,
  addManualStamp,
  removeManualStamp,
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

describe('addManualStamp / removeManualStamp', () => {
  it('adds a manual stamp and removes it', async () => {
    const { db } = makeDb()
    await addManualStamp('보너스', { db })
    const before = await getStickerState({ db })
    expect(before.count).toBe(1)
    expect(before.stamps[0].kind).toBe('manual')
    const r = await removeManualStamp(before.stamps[0].id, { db })
    expect(r.ok).toBe(true)
    expect((await getStickerState({ db })).count).toBe(0)
  })

  it('refuses to remove an auto stamp through the manual route', async () => {
    const { db } = makeDb()
    db.insert(schema.stamps).values({ forDate: '2026-05-26', kind: 'auto' }).run()
    const stamp = db.select().from(schema.stamps).get()!
    const r = await removeManualStamp(stamp.id, { db })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/자동/)
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
})
