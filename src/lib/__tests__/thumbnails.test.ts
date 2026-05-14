import { describe, it, expect, afterEach } from 'vitest'
import sharp from 'sharp'
import path from 'node:path'
import { promises as fs } from 'node:fs'

import { DATA_ROOT } from '@/lib/fs-utils'
import { generateThumbnail, thumbnailPathFor } from '@/lib/thumbnails'

afterEach(async () => {
  await fs.rm(DATA_ROOT, { recursive: true, force: true })
})

async function makePng(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 100, g: 150, b: 200 } },
  })
    .png()
    .toBuffer()
}

describe('thumbnails lib', () => {
  it('generateThumbnail writes 256px PNG and returns path', async () => {
    const src = await makePng(2000, 1500)
    const outPath = await generateThumbnail('page_test01', src)

    expect(outPath).toBe(path.join(DATA_ROOT, 'thumbs', 'page_test01.png'))
    const stat = await fs.stat(outPath)
    expect(stat.isFile()).toBe(true)

    const meta = await sharp(outPath).metadata()
    // longest edge ≤ 256
    expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBeLessThanOrEqual(256)
    // 2000:1500 = 4:3 → 256:192
    expect(meta.width).toBe(256)
    expect(meta.height).toBe(192)
  })

  it('output file < 50KB', async () => {
    const src = await makePng(3000, 3000)
    const outPath = await generateThumbnail('page_size01', src)
    const stat = await fs.stat(outPath)
    expect(stat.size).toBeLessThan(50 * 1024)
  })

  it('does not enlarge images smaller than 256', async () => {
    const src = await makePng(120, 100)
    const outPath = await generateThumbnail('page_small1', src)
    const meta = await sharp(outPath).metadata()
    expect(meta.width).toBe(120)
    expect(meta.height).toBe(100)
  })

  it('thumbnailPathFor returns canonical path', () => {
    expect(thumbnailPathFor('page_xyz123')).toBe(path.join(DATA_ROOT, 'thumbs', 'page_xyz123.png'))
  })

  it('overwrites existing thumbnail', async () => {
    const a = await makePng(500, 500)
    const b = await makePng(800, 600)
    await generateThumbnail('page_dup0001', a)
    await generateThumbnail('page_dup0001', b)
    const meta = await sharp(thumbnailPathFor('page_dup0001')).metadata()
    // second write should win (800:600 → 256:192)
    expect(meta.width).toBe(256)
    expect(meta.height).toBe(192)
  })
})
