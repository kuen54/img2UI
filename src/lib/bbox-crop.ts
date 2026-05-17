// HANDOFF §6.2:Pass 2 多参考图,从原图按 element bbox crop 出每个 element 的特写

import sharp from 'sharp'
import type { BBox } from './types'

/**
 * 按归一化 bbox 从 raw buffer crop 出像素图。
 * 失败抛错(NaN bbox / 真零面积),caller 决定跳过该 element。
 */
export async function cropFromBbox(
  rawBuf: Buffer,
  bbox: BBox,
): Promise<{ buffer: Buffer; width: number; height: number }> {
  const meta = await sharp(rawBuf).metadata()
  const W = meta.width ?? 0
  const H = meta.height ?? 0
  if (W <= 0 || H <= 0) throw new Error('invalid raw image dimensions')

  const [bx, by, bw, bh] = bbox
  if ([bx, by, bw, bh].some((v) => !Number.isFinite(v))) {
    throw new Error(`invalid bbox: ${JSON.stringify(bbox)}`)
  }
  let left = Math.round(bx * W)
  let top = Math.round(by * H)
  let width = Math.round(bw * W)
  let height = Math.round(bh * H)

  // clamp
  if (left < 0) { width += left; left = 0 }
  if (top < 0) { height += top; top = 0 }
  if (left >= W || top >= H) throw new Error('bbox starts outside image')
  if (left + width > W) width = W - left
  if (top + height > H) height = H - top
  if (width < 1 || height < 1) throw new Error(`bbox produces zero-area crop`)

  const buffer = await sharp(rawBuf)
    .extract({ left, top, width, height })
    .png()
    .toBuffer()
  return { buffer, width, height }
}

export async function bufferToDataUrl(buf: Buffer): Promise<string> {
  return `data:image/png;base64,${buf.toString('base64')}`
}
