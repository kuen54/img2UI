// 多 PNG 纵向 stack 合并。给 v0.2 multi-route 后 pass2/keyed/ 按 category 分文件用。
// API route 把所有 `${stateId}-*.png` 合并成一张大 PNG 返回,Asset Review 一眼看全。

import { promises as fs } from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'

/**
 * 列出目录下所有 `${prefix}-*.png` 文件,按字母序返回完整路径。
 * 目录不存在返回 []。
 */
export async function listMultiRouteFiles(dir: string, prefix: string): Promise<string[]> {
  try {
    const all = await fs.readdir(dir)
    return all
      .filter((f) => f.startsWith(`${prefix}-`) && f.endsWith('.png'))
      .sort()
      .map((f) => path.join(dir, f))
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw e
  }
}

/**
 * 把多张 PNG 纵向 stack 合并:每张 resize 到等宽(取最大),纵向拼。
 * 透明背景,保留每张图的 alpha。
 */
export async function stackPngsVertical(files: string[]): Promise<Buffer> {
  if (files.length === 0) throw new Error('stackPngsVertical: empty files')

  const inputs = await Promise.all(
    files.map(async (f) => {
      const buf = await fs.readFile(f)
      const meta = await sharp(buf).metadata()
      return { buf, width: meta.width ?? 0, height: meta.height ?? 0 }
    }),
  )
  const maxW = Math.max(...inputs.map((i) => i.width))

  const resized = await Promise.all(
    inputs.map(async (i) => {
      if (i.width === maxW) return { buf: i.buf, width: i.width, height: i.height }
      const out = await sharp(i.buf).resize({ width: maxW }).png().toBuffer()
      const m = await sharp(out).metadata()
      return { buf: out, width: m.width ?? maxW, height: m.height ?? i.height }
    }),
  )
  const finalH = resized.reduce((a, r) => a + r.height, 0)

  let y = 0
  const composite = resized.map((r) => {
    const item = { input: r.buf, top: y, left: 0 }
    y += r.height
    return item
  })

  return sharp({
    create: {
      width: maxW,
      height: finalH,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(composite)
    .png()
    .toBuffer()
}
