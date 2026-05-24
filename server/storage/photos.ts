import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import sharp from 'sharp'

const MAX_DIM = 1600

export function batchDir(root: string, batchId: number): string {
  const padded = String(batchId).padStart(10, '0')
  return join(root, 'photos', padded)
}

export async function saveOriginal(input: {
  root: string
  batchId: number
  index: number
  ext: string
  bytes: Buffer
}) {
  const dir = batchDir(input.root, input.batchId)
  mkdirSync(dir, { recursive: true })
  const padded = String(input.index).padStart(3, '0')
  const path = join(dir, `${padded}-orig.${input.ext}`)
  writeFileSync(path, input.bytes)
  return { path, bytes: input.bytes.length }
}

export async function makeResized(input: {
  root: string
  batchId: number
  index: number
  originalPath: string
}) {
  const dir = batchDir(input.root, input.batchId)
  const padded = String(input.index).padStart(3, '0')
  const out = join(dir, `${padded}-1600.jpg`)
  const meta = await sharp(input.originalPath)
    .rotate()                              // honor EXIF orientation then strip
    .resize({ width: MAX_DIM, height: MAX_DIM, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 86, mozjpeg: true })
    .withMetadata({ exif: {} })            // strip EXIF
    .toFile(out)
  return { path: out, width: meta.width, height: meta.height, bytes: meta.size }
}
