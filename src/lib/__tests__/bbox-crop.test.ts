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

  it('clamps x=1.0 越界 bbox to 1x1 sub-region (not throw)', async () => {
    // Phase 8f BUG #1:Pass 1 偶尔回 x=1.0 越界 bbox(实测 status_bar [1, 0.113, 0.237, 0.068])
    // 必须 clamp 救活,不能让单个坏 bbox 导致整路 Pass 2 全军覆没
    const src = await makeFixture(100, 100)
    const out = await cropFromBbox(src, [1.0, 0.5, 0.2, 0.2], { width: 100, height: 100 })
    const meta = await sharp(out).metadata()
    expect(meta.width).toBeGreaterThan(0)
    expect(meta.height).toBeGreaterThan(0)
    // 期望 1x1 起点(left=99, width=1),最多到右下角
    expect(meta.width).toBeLessThanOrEqual(1)
  })

  it('clamps y=1.0 越界 bbox to 1x1 sub-region (not throw)', async () => {
    const src = await makeFixture(100, 100)
    const out = await cropFromBbox(src, [0.5, 1.0, 0.2, 0.2], { width: 100, height: 100 })
    const meta = await sharp(out).metadata()
    expect(meta.height).toBeLessThanOrEqual(1)
    expect(meta.width).toBeGreaterThan(0)
  })

  it('throws on NaN bbox (true zero-area pathology)', async () => {
    // 真零面积 / NaN 才抛——常见越界已被 clamp 自救
    const src = await makeFixture(100, 100)
    await expect(
      cropFromBbox(src, [Number.NaN, Number.NaN, Number.NaN, Number.NaN], { width: 100, height: 100 }),
    ).rejects.toThrow(/zero/)
  })
})
