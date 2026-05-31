import { describe, it, expect, afterAll } from 'vitest'
import { mkdtempSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { batchDir, saveOriginal, makeResized } from '@/server/storage/photos'

const tmp = mkdtempSync(join(tmpdir(), 'fs-storage-'))

describe('photos storage', () => {
  afterAll(() => { rmSync(tmp, { recursive: true, force: true }) })

  it('batchDir returns deterministic path under root', () => {
    const root = '/tmp/x'
    expect(batchDir(root, 42)).toBe('/tmp/x/photos/0000000042')
  })

  it('saveOriginal writes the file and reports byte size', async () => {
    const png = await sharp({ create: { width: 100, height: 100, channels: 3, background: '#000' } })
      .png().toBuffer()
    const result = await saveOriginal({ root: tmp, batchId: 1, index: 0, ext: 'png', bytes: png })
    expect(result.path).toMatch(/0000000001\/000-orig\.png$/)
    expect(result.bytes).toBe(png.length)
    expect(readFileSync(result.path).length).toBe(png.length)
  })

  it('makeResized creates a JPEG <= 2576px on long side and reports dims', async () => {
    const png = await sharp({ create: { width: 4000, height: 3000, channels: 3, background: '#fff' } })
      .png().toBuffer()
    const orig = await saveOriginal({ root: tmp, batchId: 2, index: 0, ext: 'png', bytes: png })
    const resized = await makeResized({ root: tmp, batchId: 2, index: 0, originalPath: orig.path })
    expect(resized.path).toMatch(/0000000002\/000-2576\.jpg$/)
    expect(Math.max(resized.width, resized.height)).toBeLessThanOrEqual(2576)
  })
})
