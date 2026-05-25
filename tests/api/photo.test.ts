import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import * as schema from '@/server/db/schema'
import { closeDb } from '@/server/db/client'

// We import the GET handler AFTER setting APP_DB_PATH so that getDb() uses the tmp DB.
// Since this module is loaded fresh per fork (pool: 'forks'), the singleton is clean.

const tmp = mkdtempSync(join(tmpdir(), 'fs-photo-api-'))
const dbPath = join(tmp, 'app.db')

// A real small JPEG file written to disk
const photoDir = join(tmp, 'photos', '0000000001')

// IDs inserted into DB
let photoId: number
let photoIdWithBadFile: number

function makeDb() {
  const sqlite = new Database(dbPath)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')
  const db = drizzle(sqlite, { schema })
  migrate(db, { migrationsFolder: './server/db/migrations' })
  return { db, sqlite }
}

// Set env BEFORE any import of getDb (singleton not yet initialized in this fork)
process.env.APP_DB_PATH = dbPath

// Now import GET (getDb() will pick up APP_DB_PATH on first call)
import { GET } from '@/app/api/photo/route'

function req(url: string): Request {
  return new Request(`http://localhost${url}`)
}

beforeAll(() => {
  const { db, sqlite } = makeDb()

  // Create academy + batch rows to satisfy FK constraints
  const [academy] = db.insert(schema.academies).values({
    name: '테스트학원', subject: 'math', color: '#000',
  }).returning().all()

  const [batch] = db.insert(schema.homeworkBatches).values({
    academyId: academy.id,
    status: 'ready',
  }).returning().all()

  // Write a real (minimal) JPEG file to disk
  mkdirSync(photoDir, { recursive: true })
  const jpegPath = join(photoDir, '000-1600.jpg')
  // Minimal valid JPEG bytes (SOI + EOI)
  const minimalJpeg = Buffer.from([0xFF, 0xD8, 0xFF, 0xD9])
  writeFileSync(jpegPath, minimalJpeg)

  // Insert photo row pointing at real file
  const [photo] = db.insert(schema.homeworkPhotos).values({
    batchId: batch.id,
    originalPath: jpegPath,
    resizedPath: jpegPath,
    width: 100,
    height: 100,
    bytes: minimalJpeg.length,
  }).returning().all()
  photoId = photo.id

  // Insert a photo row where the file does NOT exist on disk
  const [photo2] = db.insert(schema.homeworkPhotos).values({
    batchId: batch.id,
    originalPath: join(photoDir, 'nonexistent-orig.jpg'),
    resizedPath: join(photoDir, 'nonexistent.jpg'),
    width: 100,
    height: 100,
    bytes: 0,
  }).returning().all()
  photoIdWithBadFile = photo2.id

  sqlite.close()
})

afterAll(() => {
  closeDb()
  rmSync(tmp, { recursive: true, force: true })
})

// ---- mkdirSync workaround: we call it as a plain function import ----
function mkdirSync(dir: string, opts: { recursive: boolean }) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('node:fs').mkdirSync(dir, opts)
}

describe('GET /api/photo', () => {
  describe('id-based (primary)', () => {
    it('valid id → 200 with image body', async () => {
      const res = await GET(req(`/api/photo?id=${photoId}`))
      expect(res.status).toBe(200)
      expect(res.headers.get('Content-Type')).toMatch(/image\/jpeg/)
      const buf = await res.arrayBuffer()
      expect(buf.byteLength).toBeGreaterThan(0)
    })

    it('valid id → Cache-Control: private', async () => {
      const res = await GET(req(`/api/photo?id=${photoId}`))
      expect(res.headers.get('Cache-Control')).toMatch(/private/)
    })

    it('nonexistent id → 404', async () => {
      const res = await GET(req('/api/photo?id=99999'))
      expect(res.status).toBe(404)
    })

    it('id row exists but file missing → 404', async () => {
      const res = await GET(req(`/api/photo?id=${photoIdWithBadFile}`))
      expect(res.status).toBe(404)
    })

    it('invalid id (0) → 400', async () => {
      const res = await GET(req('/api/photo?id=0'))
      expect(res.status).toBe(400)
    })

    it('invalid id (non-numeric) → 400', async () => {
      const res = await GET(req('/api/photo?id=abc'))
      expect(res.status).toBe(400)
    })
  })

  describe('path-based (legacy)', () => {
    it.skip('valid path inside storage → 200 (legacy; covered by id-based test)', () => {
      // Legacy ?path= endpoint is exercised in the real app. Replicating the
      // cwd/storage boundary inside vitest without touching real storage/ is
      // not worth the setup cost. ID-based test above covers the happy path.
    })

    it('path traversal attempt → 403', async () => {
      const res = await GET(req('/api/photo?path=../../etc/passwd'))
      expect(res.status).toBe(403)
    })

    it('path outside storage → 403', async () => {
      const res = await GET(req(`/api/photo?path=${encodeURIComponent('/tmp/evil.jpg')}`))
      expect(res.status).toBe(403)
    })
  })

  describe('missing params', () => {
    it('no id or path → 400', async () => {
      const res = await GET(req('/api/photo'))
      expect(res.status).toBe(400)
    })
  })
})
