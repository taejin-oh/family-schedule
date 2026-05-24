import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import * as schema from './schema'

const DEFAULT_PATH = resolve(process.cwd(), 'data/app.db')

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null
let _sqlite: Database.Database | null = null

export function getDb() {
  if (_db) return _db
  const path = process.env.APP_DB_PATH ?? DEFAULT_PATH
  mkdirSync(dirname(path), { recursive: true })
  _sqlite = new Database(path)
  _sqlite.pragma('journal_mode = WAL')
  _sqlite.pragma('foreign_keys = ON')
  _db = drizzle(_sqlite, { schema })
  migrate(_db, { migrationsFolder: resolve(process.cwd(), 'server/db/migrations') })
  // Ensure single settings row exists
  _db.insert(schema.appSettings).values({ id: 1 }).onConflictDoNothing().run()
  return _db
}

export function closeDb() {
  _sqlite?.close()
  _sqlite = null
  _db = null
}
