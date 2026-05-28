import { describe, it, expect } from 'vitest'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { eq } from 'drizzle-orm'
import sharp from 'sharp'
import * as appSchema from '@/server/db/schema'
import * as jobsSchema from '@/server/jobs/schema'
import { uploadHomework, commitBatch, updateDraftItem, addDraftItem, deleteDraftItem } from '@/server/actions/homework'
import { toggleItemDone, listCommittedItems, listDoneToday, bulkToggleItemsDone, bulkDeleteItems } from '@/server/actions/homework'

function makeDbs() {
  const dir = mkdtempSync(join(tmpdir(), 'fs-up-'))
  const appPath = join(dir, 'app.db')
  const jobsPath = join(dir, 'jobs.db')
  const appSqlite = new Database(appPath); appSqlite.pragma('foreign_keys = ON')
  const appDb = drizzle(appSqlite, { schema: appSchema })
  migrate(appDb, { migrationsFolder: './server/db/migrations' })
  const jobsSqlite = new Database(jobsPath)
  const jobsDb = drizzle(jobsSqlite, { schema: jobsSchema })
  migrate(jobsDb, { migrationsFolder: './server/jobs/migrations' })
  return { appDb, jobsDb, storageRoot: dir }
}

describe('uploadHomework', () => {
  it('creates a batch + photos rows + enqueues a job', async () => {
    const { appDb, jobsDb, storageRoot } = makeDbs()
    const [academy] = appDb.insert(appSchema.academies).values({
      name: 'X', subject: 'math', color: '#000000',
    }).returning().all()

    const png = await sharp({ create: { width: 50, height: 50, channels: 3, background: '#fff' } }).png().toBuffer()
    const file1 = new File([new Uint8Array(png)], 'a.png', { type: 'image/png' })

    const res = await uploadHomework({
      academyId: academy.id,
      files: [file1],
    }, { appDb, jobsDb, storageRoot })

    expect(res.ok).toBe(true)
    const batches = appDb.select().from(appSchema.homeworkBatches).all()
    expect(batches).toHaveLength(1)
    expect(batches[0].status).toBe('pending')
    const photos = appDb.select().from(appSchema.homeworkPhotos).all()
    expect(photos).toHaveLength(1)
    const jobs = jobsDb.select().from(jobsSchema.jobs).all()
    expect(jobs).toHaveLength(1)
    expect(jobs[0].payload).toEqual({ batchId: batches[0].id })
  })

  it('rejects when academyId does not exist', async () => {
    const { appDb, jobsDb, storageRoot } = makeDbs()
    const png = await sharp({ create: { width: 50, height: 50, channels: 3, background: '#fff' } }).png().toBuffer()
    const f = new File([new Uint8Array(png)], 'a.png', { type: 'image/png' })
    const res = await uploadHomework({ academyId: 9999, files: [f] }, { appDb, jobsDb, storageRoot })
    expect(res.ok).toBe(false)
  })

  it('rejects when files is empty', async () => {
    const { appDb, jobsDb, storageRoot } = makeDbs()
    const [a] = appDb.insert(appSchema.academies).values({ name: 'X', subject: 'math', color: '#000000' }).returning().all()
    const res = await uploadHomework({ academyId: a.id, files: [] }, { appDb, jobsDb, storageRoot })
    expect(res.ok).toBe(false)
  })

  it('accepts a PDF; stores original without resizing', async () => {
    const { appDb, jobsDb, storageRoot } = makeDbs()
    const [academy] = appDb.insert(appSchema.academies).values({
      name: 'X', subject: 'math', color: '#000000',
    }).returning().all()

    // Minimal valid-ish PDF byte sequence (header + EOF marker — enough for storage tests)
    const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2D, 0x31, 0x2E, 0x34, 0x0A, 0x25, 0xE2, 0xE3, 0xCF, 0xD3, 0x0A, 0x25, 0x25, 0x45, 0x4F, 0x46])
    const pdf = new File([pdfBytes], 'hw.pdf', { type: 'application/pdf' })

    const res = await uploadHomework({ academyId: academy.id, files: [pdf] }, { appDb, jobsDb, storageRoot })
    expect(res.ok).toBe(true)

    const photos = appDb.select().from(appSchema.homeworkPhotos).all()
    expect(photos).toHaveLength(1)
    expect(photos[0].originalPath).toMatch(/\.pdf$/)
    // For non-image inputs, resizedPath equals originalPath (no sharp call)
    expect(photos[0].resizedPath).toBe(photos[0].originalPath)
    expect(photos[0].width).toBe(0)
    expect(photos[0].height).toBe(0)
  })

  it('rejects unsupported MIME types', async () => {
    const { appDb, jobsDb, storageRoot } = makeDbs()
    const [a] = appDb.insert(appSchema.academies).values({ name: 'X', subject: 'math', color: '#000000' }).returning().all()
    const txt = new File([new Uint8Array([72, 105])], 'note.txt', { type: 'text/plain' })
    const res = await uploadHomework({ academyId: a.id, files: [txt] }, { appDb, jobsDb, storageRoot })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toMatch(/지원하지 않는|unsupported/i)
  })

  it('marks batch failed when file write fails (atomic cleanup)', async () => {
    const { appDb, jobsDb } = makeDbs()
    const [academy] = appDb.insert(appSchema.academies).values({ name: 'X', subject: 'math', color: '#000000' }).returning().all()

    // Use a storageRoot that is a file (not a dir) so mkdirSync inside saveOriginal throws
    const tmpDir = mkdtempSync(join(tmpdir(), 'fs-up-fail-'))
    const blockedRoot = join(tmpDir, 'not-a-dir')
    writeFileSync(blockedRoot, 'block')  // exists as a file — mkdirSync will fail

    const png = await sharp({ create: { width: 50, height: 50, channels: 3, background: '#fff' } }).png().toBuffer()
    const file1 = new File([new Uint8Array(png)], 'a.png', { type: 'image/png' })

    await expect(
      uploadHomework({ academyId: academy.id, files: [file1] }, { appDb, jobsDb, storageRoot: blockedRoot }),
    ).rejects.toThrow()

    // Batch row must exist with status=failed
    const batches = appDb.select().from(appSchema.homeworkBatches).all()
    expect(batches).toHaveLength(1)
    expect(batches[0].status).toBe('failed')
    expect(batches[0].failureReason).toBeTruthy()
  })
})

describe('reviewBatch actions', () => {
  it('commitBatch flips items to is_committed=true and batch to committed', async () => {
    const { appDb } = makeDbs()
    const [academy] = appDb.insert(appSchema.academies).values({ name: 'X', subject: 'math', color: '#000000' }).returning().all()
    const [batch] = appDb.insert(appSchema.homeworkBatches).values({ academyId: academy.id, status: 'ready' }).returning().all()
    appDb.insert(appSchema.homeworkItems).values([
      { batchId: batch.id, academyId: academy.id, title: 'a', source: 'ai', isCommitted: false, dueDate: '2026-05-28' },
      { batchId: batch.id, academyId: academy.id, title: 'b', source: 'ai', isCommitted: false, dueDate: '2026-05-27' },
    ]).run()
    const res = await commitBatch(batch.id, { appDb })
    expect(res.ok).toBe(true)
    const items = appDb.select().from(appSchema.homeworkItems).where(eq(appSchema.homeworkItems.batchId, batch.id)).all()
    expect(items.every((it) => it.isCommitted)).toBe(true)
    const upd = appDb.select().from(appSchema.homeworkBatches).where(eq(appSchema.homeworkBatches.id, batch.id)).get()
    expect(upd?.status).toBe('committed')
  })

  it('commitBatch rejects null dueDate when academy has no schedule rule', async () => {
    const { appDb } = makeDbs()
    const [academy] = appDb.insert(appSchema.academies).values({ name: 'X', subject: 'math', color: '#000000' }).returning().all()
    const [batch] = appDb.insert(appSchema.homeworkBatches).values({ academyId: academy.id, status: 'ready' }).returning().all()
    appDb.insert(appSchema.homeworkItems).values([
      { batchId: batch.id, academyId: academy.id, title: '미정', source: 'ai', isCommitted: false, dueDate: null },
    ]).run()
    const res = await commitBatch(batch.id, { appDb })
    expect(res.ok).toBe(false)
    if (res.ok) throw new Error('expected failure')
    expect(res.error).toMatch(/시간표|마감일/)
  })

  it('commitBatch allows null dueDate when academy has schedule rule (runner auto-fill responsibility)', async () => {
    const { appDb } = makeDbs()
    const [academy] = appDb.insert(appSchema.academies).values({
      name: 'X', subject: 'math', color: '#000000',
      scheduleRule: { slots: [{ day: 'mon', start: '17:00', end: '18:00' }] },
    }).returning().all()
    const [batch] = appDb.insert(appSchema.homeworkBatches).values({ academyId: academy.id, status: 'ready' }).returning().all()
    appDb.insert(appSchema.homeworkItems).values([
      { batchId: batch.id, academyId: academy.id, title: 'a', source: 'ai', isCommitted: false, dueDate: null },
    ]).run()
    const res = await commitBatch(batch.id, { appDb })
    expect(res.ok).toBe(true)
  })

  it('updateDraftItem mutates title/dueDate', async () => {
    const { appDb } = makeDbs()
    const [academy] = appDb.insert(appSchema.academies).values({ name: 'X', subject: 'math', color: '#000000' }).returning().all()
    const [batch] = appDb.insert(appSchema.homeworkBatches).values({ academyId: academy.id, status: 'ready' }).returning().all()
    const [item] = appDb.insert(appSchema.homeworkItems).values({
      batchId: batch.id, academyId: academy.id, title: 'a', source: 'ai', isCommitted: false, dueDate: null,
    }).returning().all()
    const res = await updateDraftItem(item.id, { title: 'A2', dueDate: '2026-06-01' }, { appDb })
    expect(res.ok).toBe(true)
    const got = appDb.select().from(appSchema.homeworkItems).where(eq(appSchema.homeworkItems.id, item.id)).get()
    expect(got?.title).toBe('A2')
    expect(got?.dueDate).toBe('2026-06-01')
  })

  it('addDraftItem rejects title over 500 chars', async () => {
    const { appDb } = makeDbs()
    const [academy] = appDb.insert(appSchema.academies).values({ name: 'X', subject: 'math', color: '#000000' }).returning().all()
    const [batch] = appDb.insert(appSchema.homeworkBatches).values({ academyId: academy.id, status: 'ready' }).returning().all()
    const res = await addDraftItem(batch.id, { title: 'x'.repeat(501), dueDate: null }, { appDb })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toMatch(/깁니다|너무/)
  })

  it('addDraftItem inserts a manual draft', async () => {
    const { appDb } = makeDbs()
    const [academy] = appDb.insert(appSchema.academies).values({ name: 'X', subject: 'math', color: '#000000' }).returning().all()
    const [batch] = appDb.insert(appSchema.homeworkBatches).values({ academyId: academy.id, status: 'ready' }).returning().all()
    const res = await addDraftItem(batch.id, { title: 'new', dueDate: null }, { appDb })
    expect(res.ok).toBe(true)
    const all = appDb.select().from(appSchema.homeworkItems).all()
    expect(all).toHaveLength(1)
    expect(all[0].source).toBe('manual')
  })

  it('deleteDraftItem removes a non-committed item', async () => {
    const { appDb } = makeDbs()
    const [academy] = appDb.insert(appSchema.academies).values({ name: 'X', subject: 'math', color: '#000000' }).returning().all()
    const [batch] = appDb.insert(appSchema.homeworkBatches).values({ academyId: academy.id, status: 'ready' }).returning().all()
    const [item] = appDb.insert(appSchema.homeworkItems).values({
      batchId: batch.id, academyId: academy.id, title: 'a', source: 'ai', isCommitted: false, dueDate: null,
    }).returning().all()
    const res = await deleteDraftItem(item.id, { appDb })
    expect(res.ok).toBe(true)
    expect(appDb.select().from(appSchema.homeworkItems).all()).toHaveLength(0)
  })

  it('updateDraftItem refuses to edit committed items', async () => {
    const { appDb } = makeDbs()
    const [academy] = appDb.insert(appSchema.academies).values({ name: 'X', subject: 'math', color: '#000000' }).returning().all()
    const [batch] = appDb.insert(appSchema.homeworkBatches).values({ academyId: academy.id, status: 'committed' }).returning().all()
    const [item] = appDb.insert(appSchema.homeworkItems).values({
      batchId: batch.id, academyId: academy.id, title: 'a', source: 'ai', isCommitted: true, dueDate: null,
    }).returning().all()
    const res = await updateDraftItem(item.id, { title: 'changed' }, { appDb })
    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/확정/)
  })

  it('deleteDraftItem refuses to delete committed items', async () => {
    const { appDb } = makeDbs()
    const [academy] = appDb.insert(appSchema.academies).values({ name: 'X', subject: 'math', color: '#000000' }).returning().all()
    const [batch] = appDb.insert(appSchema.homeworkBatches).values({ academyId: academy.id, status: 'committed' }).returning().all()
    const [item] = appDb.insert(appSchema.homeworkItems).values({
      batchId: batch.id, academyId: academy.id, title: 'a', source: 'ai', isCommitted: true, dueDate: null,
    }).returning().all()
    const res = await deleteDraftItem(item.id, { appDb })
    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/확정/)
    expect(appDb.select().from(appSchema.homeworkItems).all()).toHaveLength(1)
  })

  it('commitBatch refuses when batch already committed', async () => {
    const { appDb } = makeDbs()
    const [academy] = appDb.insert(appSchema.academies).values({ name: 'X', subject: 'math', color: '#000000' }).returning().all()
    const [batch] = appDb.insert(appSchema.homeworkBatches).values({ academyId: academy.id, status: 'committed' }).returning().all()
    const res = await commitBatch(batch.id, { appDb })
    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/이미 확정/)
  })

  it('addDraftItem refuses to insert into a committed batch', async () => {
    const { appDb } = makeDbs()
    const [academy] = appDb.insert(appSchema.academies).values({ name: 'X', subject: 'math', color: '#000000' }).returning().all()
    const [batch] = appDb.insert(appSchema.homeworkBatches).values({ academyId: academy.id, status: 'committed' }).returning().all()
    const res = await addDraftItem(batch.id, { title: 'late', dueDate: null }, { appDb })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toMatch(/확정|committed/i)
    // confirm no row inserted
    expect(appDb.select().from(appSchema.homeworkItems).all()).toHaveLength(0)
  })

  it('commitBatch refuses when batch does not exist', async () => {
    const { appDb } = makeDbs()
    const res = await commitBatch(9999, { appDb })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toMatch(/존재하지 않는/)
  })

  it('commitBatch refuses when batch status is pending', async () => {
    const { appDb } = makeDbs()
    const [academy] = appDb.insert(appSchema.academies).values({ name: 'X', subject: 'math', color: '#000000' }).returning().all()
    const [batch] = appDb.insert(appSchema.homeworkBatches).values({ academyId: academy.id, status: 'pending' }).returning().all()
    const res = await commitBatch(batch.id, { appDb })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toMatch(/pending/)
  })

  it('commitBatch refuses when batch status is processing', async () => {
    const { appDb } = makeDbs()
    const [academy] = appDb.insert(appSchema.academies).values({ name: 'X', subject: 'math', color: '#000000' }).returning().all()
    const [batch] = appDb.insert(appSchema.homeworkBatches).values({ academyId: academy.id, status: 'processing' }).returning().all()
    const res = await commitBatch(batch.id, { appDb })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toMatch(/processing/)
  })

  it('commitBatch refuses when batch status is failed', async () => {
    const { appDb } = makeDbs()
    const [academy] = appDb.insert(appSchema.academies).values({ name: 'X', subject: 'math', color: '#000000' }).returning().all()
    const [batch] = appDb.insert(appSchema.homeworkBatches).values({ academyId: academy.id, status: 'failed' }).returning().all()
    const res = await commitBatch(batch.id, { appDb })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toMatch(/failed/)
  })
})

describe('toggleItemDone + listCommittedItems', () => {
  it('toggleItemDone flips done_at on/off', async () => {
    const { appDb } = makeDbs()
    const [a] = appDb.insert(appSchema.academies).values({ name: 'X', subject: 'math', color: '#000000' }).returning().all()
    const [b] = appDb.insert(appSchema.homeworkBatches).values({ academyId: a.id, status: 'committed' }).returning().all()
    const [it] = appDb.insert(appSchema.homeworkItems).values({
      batchId: b.id, academyId: a.id, title: 'x', source: 'ai', isCommitted: true, dueDate: null,
    }).returning().all()
    let res = await toggleItemDone(it.id, true, { appDb })
    expect(res.ok).toBe(true)
    expect(appDb.select().from(appSchema.homeworkItems).where(eq(appSchema.homeworkItems.id, it.id)).get()?.doneAt).not.toBeNull()
    res = await toggleItemDone(it.id, false, { appDb })
    expect(appDb.select().from(appSchema.homeworkItems).where(eq(appSchema.homeworkItems.id, it.id)).get()?.doneAt).toBeNull()
  })

  it('listCommittedItems returns only committed undone items joined with academy color/name + ordered by due date asc nulls last', async () => {
    const { appDb } = makeDbs()
    const [a] = appDb.insert(appSchema.academies).values({ name: '수학', subject: 'math', color: '#ef4444' }).returning().all()
    const [b] = appDb.insert(appSchema.homeworkBatches).values({ academyId: a.id, status: 'committed' }).returning().all()
    appDb.insert(appSchema.homeworkItems).values([
      { batchId: b.id, academyId: a.id, title: 'done one',  source: 'ai', isCommitted: true, doneAt: new Date(), dueDate: '2026-05-25' },
      { batchId: b.id, academyId: a.id, title: 'no-date',   source: 'ai', isCommitted: true, dueDate: null },
      { batchId: b.id, academyId: a.id, title: 'late',      source: 'ai', isCommitted: true, dueDate: '2026-06-10' },
      { batchId: b.id, academyId: a.id, title: 'soon',      source: 'ai', isCommitted: true, dueDate: '2026-05-27' },
      { batchId: b.id, academyId: a.id, title: 'draft',     source: 'ai', isCommitted: false, dueDate: '2026-05-26' },
    ]).run()
    const out = await listCommittedItems({ appDb })
    expect(out.map((x) => x.title)).toEqual(['soon', 'late', 'no-date'])
    expect(out[0].academyName).toBe('수학')
    expect(out[0].academyColor).toBe('#ef4444')
  })

  it('bulkToggleItemsDone marks multiple items done in one call', async () => {
    const { appDb } = makeDbs()
    const [a] = appDb.insert(appSchema.academies).values({ name: 'X', subject: 'math', color: '#000000' }).returning().all()
    const [b] = appDb.insert(appSchema.homeworkBatches).values({ academyId: a.id, status: 'committed' }).returning().all()
    const inserted = appDb.insert(appSchema.homeworkItems).values([
      { batchId: b.id, academyId: a.id, title: 'a', source: 'ai', isCommitted: true, dueDate: null },
      { batchId: b.id, academyId: a.id, title: 'b', source: 'ai', isCommitted: true, dueDate: null },
      { batchId: b.id, academyId: a.id, title: 'c', source: 'ai', isCommitted: true, dueDate: null },
    ]).returning().all()
    const ids = inserted.map((i) => i.id)
    const res = await bulkToggleItemsDone([ids[0], ids[1]], true, { appDb })
    expect(res.ok).toBe(true)
    const rows = appDb.select().from(appSchema.homeworkItems).all()
    expect(rows.find((r) => r.id === ids[0])?.doneAt).not.toBeNull()
    expect(rows.find((r) => r.id === ids[1])?.doneAt).not.toBeNull()
    expect(rows.find((r) => r.id === ids[2])?.doneAt).toBeNull()
  })

  it('bulkToggleItemsDone can undo (set done=false)', async () => {
    const { appDb } = makeDbs()
    const [a] = appDb.insert(appSchema.academies).values({ name: 'X', subject: 'math', color: '#000000' }).returning().all()
    const [b] = appDb.insert(appSchema.homeworkBatches).values({ academyId: a.id, status: 'committed' }).returning().all()
    const [it] = appDb.insert(appSchema.homeworkItems).values({
      batchId: b.id, academyId: a.id, title: 'x', source: 'ai', isCommitted: true, doneAt: new Date(), dueDate: null,
    }).returning().all()
    const res = await bulkToggleItemsDone([it.id], false, { appDb })
    expect(res.ok).toBe(true)
    expect(appDb.select().from(appSchema.homeworkItems).where(eq(appSchema.homeworkItems.id, it.id)).get()?.doneAt).toBeNull()
  })

  it('bulkDeleteItems removes all specified items', async () => {
    const { appDb } = makeDbs()
    const [a] = appDb.insert(appSchema.academies).values({ name: 'X', subject: 'math', color: '#000000' }).returning().all()
    const [b] = appDb.insert(appSchema.homeworkBatches).values({ academyId: a.id, status: 'committed' }).returning().all()
    const inserted = appDb.insert(appSchema.homeworkItems).values([
      { batchId: b.id, academyId: a.id, title: 'del1', source: 'ai', isCommitted: true, dueDate: null },
      { batchId: b.id, academyId: a.id, title: 'del2', source: 'ai', isCommitted: true, dueDate: null },
      { batchId: b.id, academyId: a.id, title: 'keep', source: 'ai', isCommitted: true, dueDate: null },
    ]).returning().all()
    const res = await bulkDeleteItems([inserted[0].id, inserted[1].id], { appDb })
    expect(res.ok).toBe(true)
    const remaining = appDb.select().from(appSchema.homeworkItems).all()
    expect(remaining).toHaveLength(1)
    expect(remaining[0].title).toBe('keep')
  })

  it('listDoneToday returns only items completed in current local day, newest first', async () => {
    const { appDb } = makeDbs()
    const [a] = appDb.insert(appSchema.academies).values({ name: 'X', subject: 'math', color: '#000000' }).returning().all()
    const [b] = appDb.insert(appSchema.homeworkBatches).values({ academyId: a.id, status: 'committed' }).returning().all()

    // Use fixed local hours (08:00, 12:00) instead of "now - N hours" to
    // avoid midnight-boundary flakes (e.g. 1h-ago at 00:30 becomes yesterday).
    const now = Date.now()
    const noonToday = new Date(); noonToday.setHours(12, 0, 0, 0)
    const eightToday = new Date(); eightToday.setHours(8, 0, 0, 0)
    const yesterday = new Date(now - 24 * 60 * 60 * 1000); yesterday.setHours(12, 0, 0, 0)

    appDb.insert(appSchema.homeworkItems).values([
      { batchId: b.id, academyId: a.id, title: 'old (yesterday)', source: 'ai', isCommitted: true, doneAt: yesterday, dueDate: null },
      { batchId: b.id, academyId: a.id, title: 'older (08:00)',   source: 'ai', isCommitted: true, doneAt: eightToday, dueDate: null },
      { batchId: b.id, academyId: a.id, title: 'newer (12:00)',   source: 'ai', isCommitted: true, doneAt: noonToday,  dueDate: null },
      { batchId: b.id, academyId: a.id, title: 'still active',    source: 'ai', isCommitted: true, doneAt: null,       dueDate: null },
      { batchId: b.id, academyId: a.id, title: 'draft (skip)',    source: 'ai', isCommitted: false, doneAt: noonToday, dueDate: null },
    ]).run()

    const out = await listDoneToday({ appDb })
    expect(out.map((x) => x.title)).toEqual(['newer (12:00)', 'older (08:00)'])
  })
})
