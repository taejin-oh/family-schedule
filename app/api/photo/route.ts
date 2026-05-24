import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const path = url.searchParams.get('path')
  if (!path) return new Response('missing path', { status: 400 })
  const abs = resolve(path)
  const storageRoot = resolve(process.cwd(), 'storage')
  if (!abs.startsWith(storageRoot)) return new Response('forbidden', { status: 403 })
  let bytes: Buffer
  try {
    bytes = await readFile(abs)
  } catch {
    return new Response('not found', { status: 404 })
  }
  const lower = abs.toLowerCase()
  const ct = lower.endsWith('.pdf') ? 'application/pdf'
           : lower.endsWith('.png') ? 'image/png'
           : lower.endsWith('.webp') ? 'image/webp'
           : lower.endsWith('.heic') ? 'image/heic'
           : 'image/jpeg'
  return new Response(new Uint8Array(bytes), { headers: { 'Content-Type': ct, 'Cache-Control': 'private, max-age=60' } })
}
