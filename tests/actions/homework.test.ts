import { describe, it, expect } from 'vitest'
import { mkdtempSync } from 'node:fs'
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
import { toggleItemDone, listCommittedItems, listDoneToday } from '@/server/actions/homework'

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
})

describe('reviewBatch actions', () => {
  it('commitBatch flips items to is_committed=true and batch to committed', async () => {
    const { appDb } = makeDbs()
    const [academy] = appDb.insert(appSchema.academies).values({ name: 'X', subject: 'math', color: '#000000' }).returning().all()
    const [batch] = appDb.insert(appSchema.homeworkBatches).values({ academyId: academy.id, status: 'ready' }).returning().all()
    appDb.insert(appSchema.homeworkItems).values([
      { batchId: batch.id, academyId: academy.id, title: 'a', source: 'ai', isCommitted: false, dueDate: null },
      { batchId: batch.id, academyId: academy.id, title: 'b', source: 'ai', isCommitted: false, dueDate: '2026-05-27' },
    ]).run()
    const res = await commitBatch(batch.id, { appDb })
    expect(res.ok).toBe(true)
    const items = appDb.select().from(appSchema.homeworkItems).where(eq(appSchema.homeworkItems.batchId, batch.id)).all()
    expect(items.every((it) => it.isCommitted)).toBe(true)
    const upd = appDb.select().from(appSchema.homeworkBatches).where(eq(appSchema.homeworkBatches.id, batch.id)).get()
    expect(upd?.status).toBe('committed')
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

  it('listDoneToday returns only items completed in current local day, newest first', async () => {
    const { appDb } = makeDbs()
    const [a] = appDb.insert(appSchema.academies).values({ name: 'X', subject: 'math', color: '#000000' }).returning().all()
    const [b] = appDb.insert(appSchema.homeworkBatches).values({ academyId: a.id, status: 'committed' }).returning().all()

    const now = Date.now()
    const oneHourAgo = new Date(now - 60 * 60 * 1000)
    const tenMinAgo = new Date(now - 10 * 60 * 1000)
    const yesterday = new Date(now - 24 * 60 * 60 * 1000); yesterday.setHours(12, 0, 0, 0)

    appDb.insert(appSchema.homeworkItems).values([
      { batchId: b.id, academyId: a.id, title: 'old (yesterday)', source: 'ai', isCommitted: true, doneAt: yesterday, dueDate: null },
      { batchId: b.id, academyId: a.id, title: 'older (1h ago)',  source: 'ai', isCommitted: true, doneAt: oneHourAgo,  dueDate: null },
      { batchId: b.id, academyId: a.id, title: 'newer (10m ago)', source: 'ai', isCommitted: true, doneAt: tenMinAgo,   dueDate: null },
      { batchId: b.id, academyId: a.id, title: 'still active',    source: 'ai', isCommitted: true, doneAt: null,        dueDate: null },
      { batchId: b.id, academyId: a.id, title: 'draft (skip)',    source: 'ai', isCommitted: false, doneAt: tenMinAgo,   dueDate: null },
    ]).run()

    const out = await listDoneToday({ appDb })
    expect(out.map((x) => x.title)).toEqual(['newer (10m ago)', 'older (1h ago)'])
  })
})
