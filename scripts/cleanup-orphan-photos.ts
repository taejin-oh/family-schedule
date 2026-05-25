/**
 * Orphan photo cleanup script.
 *
 * Compares files on disk under storage/photos/ against the DB rows in
 * homeworkPhotos (originalPath + resizedPath). Files not referenced by any
 * DB row are "orphans".
 *
 * Default: dry-run (list only).
 * Pass --delete to actually remove orphan files.
 *
 * Usage:
 *   pnpm cleanup:orphan-photos           # dry-run
 *   pnpm cleanup:orphan-photos -- --delete
 */

import { readdirSync, statSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from '../server/db/schema'

const shouldDelete = process.argv.includes('--delete')
const cwd = process.cwd()
const dbPath = resolve(cwd, 'data/app.db')
const storagePhotosDir = resolve(cwd, 'storage/photos')

function collectFiles(dir: string): string[] {
  const results: string[] = []
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return results
  }
  for (const entry of entries) {
    const full = join(dir, entry)
    const stat = statSync(full)
    if (stat.isDirectory()) {
      results.push(...collectFiles(full))
    } else {
      results.push(full)
    }
  }
  return results
}

const sqlite = new Database(dbPath, { readonly: true })
const db = drizzle(sqlite, { schema })
// We do not run migrate here — DB must already be migrated before calling this script.
// migrate(db, { migrationsFolder: resolve(cwd, 'server/db/migrations') })

const rows = db.select({
  originalPath: schema.homeworkPhotos.originalPath,
  resizedPath: schema.homeworkPhotos.resizedPath,
}).from(schema.homeworkPhotos).all()

sqlite.close()

const knownPaths = new Set<string>()
for (const row of rows) {
  knownPaths.add(resolve(row.originalPath))
  knownPaths.add(resolve(row.resizedPath))
}

console.log(`DB rows: ${rows.length} (${knownPaths.size} distinct paths)`)

const diskFiles = collectFiles(storagePhotosDir)
console.log(`Disk files under storage/photos/: ${diskFiles.length}`)

const orphans = diskFiles.filter((f) => !knownPaths.has(f))

if (orphans.length === 0) {
  console.log('No orphans found.')
  process.exit(0)
}

console.log(`\nOrphans (${orphans.length}):`)
for (const f of orphans) {
  console.log(`  ${f}`)
}

if (shouldDelete) {
  console.log('\nDeleting orphans...')
  for (const f of orphans) {
    rmSync(f, { force: true })
    console.log(`  deleted: ${f}`)
  }
  console.log('Done.')
} else {
  console.log('\nDry-run — pass --delete to remove.')
}
