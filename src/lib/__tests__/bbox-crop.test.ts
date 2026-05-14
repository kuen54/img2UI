import { describe, it, expect } from 'vitest'
import sharp from 'sharp'
import { cropFromBbox } from '@/lib/bbox-crop'

async function makeFixture(width = 100, height = 100): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 200, g: 100, b: 50 } },
  })
    .png()
    .toBuffer()
}

describe('cropFromBbox', () => {
  it('extracts a sub-region by normalized bbox', async () => {
    const src = await makeFixture(100, 100)
    const out = await cropFromBbox(src, [0.1, 0.1, 0.5, 0.5], { width: 100, height: 100 })
    const meta = await sharp(out).metadata()
    expect(meta.width).toBe(50)
    expect(meta.height).toBe(50)
  })

  it('clamps bbox extending past image edges', async () => {
    const src = await makeFixture(100, 100)
    const out = await cropFromBbox(src, [0.8, 0.8, 0.5, 0.5], { width: 100, height: 100 })
    const meta = await sharp(out).metadata()
    expect(meta.width).toBeLessThanOrEqual(20)
    expect(meta.height).toBeLessThanOrEqual(20)
    expect(meta.width).toBeGreaterThan(0)
    expect(meta.height).toBeGreaterThan(0)
  })

  it('throws on zero-area bbox', async () => {
    const src = await makeFixture(100, 100)
    await expect(cropFromBbox(src, [0, 0, 0, 0], { width: 100, height: 100 })).rejects.toThrow(/zero/)
  })

  it('throws when bbox starts past right edge', async () => {
    const src = await makeFixture(100, 100)
    await expect(cropFromBbox(src, [1.0, 0.5, 0.1, 0.1], { width: 100, height: 100 })).rejects.toThrow(/zero/)
  })
})
