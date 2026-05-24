import { describe, it, expect } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import sharp from 'sharp'
import * as appSchema from '@/server/db/schema'
import * as jobsSchema from '@/server/jobs/schema'
import { uploadHomework } from '@/server/actions/homework'

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
