import { readFile } from 'node:fs/promises'
import { resolve, sep, relative } from 'node:path'
import { getDb } from '@/server/db/client'
import * as schema from '@/server/db/schema'
import { eq } from 'drizzle-orm'

export const dynamic = 'force-dynamic'

function mimeFromPath(abs: string): string {
  const lower = abs.toLowerCase()
  if (lower.endsWith('.pdf')) return 'application/pdf'
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.webp')) return 'image/webp'
  if (lower.endsWith('.heic')) return 'image/heic'
  return 'image/jpeg'
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const idParam = url.searchParams.get('id')
  const pathParam = url.searchParams.get('path')

  // --- ID-based (primary) ---
  if (idParam !== null) {
    const id = Number(idParam)
    if (!Number.isInteger(id) || id <= 0) {
      return new Response('invalid id', { status: 400 })
    }
    const db = getDb()
    const row = db
      .select()
      .from(schema.homeworkPhotos)
      .where(eq(schema.homeworkPhotos.id, id))
      .get()
    if (!row) return new Response('not found', { status: 404 })

    const variant = url.searchParams.get('variant')
    const filePath = variant === 'orig' ? row.originalPath : row.resizedPath

    let bytes: Buffer
    try {
      bytes = await readFile(filePath)
    } catch {
      return new Response('file not found', { status: 404 })
    }
    return new Response(new Uint8Array(bytes), {
      headers: {
        'Content-Type': mimeFromPath(filePath),
        'Cache-Control': 'private, max-age=3600',
      },
    })
  }

  // --- Path-based (legacy / deprecated) ---
  if (pathParam !== null) {
    const storageRoot = resolve(process.cwd(), 'storage')
    const abs = resolve(pathParam)
    const rel = relative(storageRoot, abs)
    if (rel.startsWith('..') || rel === '' || rel.startsWith(sep) || abs === storageRoot) {
      return new Response('forbidden', { status: 403 })
    }
    let bytes: Buffer
    try {
      bytes = await readFile(abs)
    } catch {
      return new Response('not found', { status: 404 })
    }
    return new Response(new Uint8Array(bytes), {
      headers: {
        'Content-Type': mimeFromPath(abs),
        'Cache-Control': 'private, max-age=60',
      },
    })
  }

  return new Response('missing id or path', { status: 400 })
}
