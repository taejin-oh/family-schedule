/**
 * Tests for app/api/homework/batches/[id]/stream/route.ts
 *
 * The route uses getDb() singleton, so we set APP_DB_PATH before importing
 * and close the connection in afterAll — same pattern as tests/api/photo.test.ts.
 *
 * Pool: 'forks' (per vitest.config.ts) keeps this singleton isolated per test file.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import * as schema from '@/server/db/schema'
import { closeDb } from '@/server/db/client'

// Set APP_DB_PATH before any import that calls getDb()
const tmp = mkdtempSync(join(tmpdir(), 'fs-stream-'))
const dbPath = join(tmp, 'app.db')
process.env.APP_DB_PATH = dbPath

// Import route AFTER setting env — getDb() uses the path on first call
import { GET } from '@/app/api/homework/batches/[id]/stream/route'

let batchId: number

function makeCtx(id: string) {
  return { params: Promise.resolve({ id }) }
}

beforeAll(() => {
  const sqlite = new Database(dbPath)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')
  const db = drizzle(sqlite, { schema })
  migrate(db, { migrationsFolder: './server/db/migrations' })
  db.insert(schema.appSettings).values({ id: 1 }).onConflictDoNothing().run()

  const [a] = db.insert(schema.academies).values({ name: 'A', subject: 'math', color: '#000000' }).returning().all()
  const [b] = db.insert(schema.homeworkBatches).values({ academyId: a.id, status: 'ready' }).returning().all()
  batchId = b.id

  sqlite.close()
})

afterAll(() => {
  closeDb()
})

async function readSSE(res: Response): Promise<string[]> {
  const text = await res.text()
  return text.split('\n\n').filter(Boolean)
}

describe('GET /api/homework/batches/[id]/stream', () => {
  describe('invalid id', () => {
    it('NaN id → 400', async () => {
      const req = new Request('http://localhost/api/homework/batches/abc/stream')
      const res = await GET(req, makeCtx('abc'))
      expect(res.status).toBe(400)
    })

    it('zero id → 400', async () => {
      const req = new Request('http://localhost/api/homework/batches/0/stream')
      const res = await GET(req, makeCtx('0'))
      expect(res.status).toBe(400)
    })

    it('negative id → 400', async () => {
      const req = new Request('http://localhost/api/homework/batches/-5/stream')
      const res = await GET(req, makeCtx('-5'))
      expect(res.status).toBe(400)
    })
  })

  describe('non-existent batch', () => {
    it('sends SSE error event then closes', async () => {
      const req = new Request('http://localhost/api/homework/batches/99999/stream')
      const res = await GET(req, makeCtx('99999'))
      expect(res.status).toBe(200)
      expect(res.headers.get('Content-Type')).toMatch(/text\/event-stream/)
      const chunks = await readSSE(res)
      // Must contain an error event
      const hasError = chunks.some((c) => c.includes('event: error') && c.includes('not found'))
      expect(hasError).toBe(true)
    })
  })

  describe('existing batch', () => {
    it('returns 200 SSE response with Content-Type text/event-stream', async () => {
      const req = new Request(`http://localhost/api/homework/batches/${batchId}/stream`)
      const res = await GET(req, makeCtx(String(batchId)))
      expect(res.status).toBe(200)
      expect(res.headers.get('Content-Type')).toMatch(/text\/event-stream/)
    })

    it('first data event contains batch status JSON', async () => {
      const req = new Request(`http://localhost/api/homework/batches/${batchId}/stream`)
      const res = await GET(req, makeCtx(String(batchId)))
      const chunks = await readSSE(res)
      // At least one data: {...} line
      const dataLines = chunks.flatMap((c) =>
        c.split('\n').filter((l) => l.startsWith('data: '))
      )
      expect(dataLines.length).toBeGreaterThan(0)
      const payload = JSON.parse(dataLines[0].replace('data: ', ''))
      expect(payload).toHaveProperty('status')
    })
  })
})
