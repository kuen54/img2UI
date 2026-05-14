// 从原图按归一化 bbox 用 sharp.extract 切出 sub-region
// Phase 8c:Pass 2 多参考图所需,每个 element 一张 crop 喂给 image_gen
// Phase 8f:激进 clamp——x=1.0 / y=1.0 越界 case 也救活到 1×1,只对 NaN/真零面积抛错

import sharp from 'sharp'
import type { Bbox } from '@/lib/bbox-iou'

export async function cropFromBbox(
  rawBuffer: Buffer,
  bbox: Bbox,
  imgSize: { width: number; height: number },
): Promise<Buffer> {
  const [x, y, w, h] = bbox

  // NaN/Infinity 拦在前面——sharp.extract 会抛 cryptic error,不如自己抛 zero
  if (![x, y, w, h].every((v) => Number.isFinite(v))) {
    throw new Error(
      `cropFromBbox: zero-area bbox ${JSON.stringify(bbox)} on ${imgSize.width}x${imgSize.height}`,
    )
  }

  // Clamp x/y 到 [0, 1 - 1px) — 留至少 1 像素给 width/height,避免 left=imgSize.width
  const epsW = 1 / imgSize.width
  const epsH = 1 / imgSize.height
  const cx = Math.max(0, Math.min(1 - epsW, x))
  const cy = Math.max(0, Math.min(1 - epsH, y))

  const left = Math.floor(cx * imgSize.width)
  const top = Math.floor(cy * imgSize.height)
  // width/height 至少 1 像素;不超过图片右/下边界
  const rawWidth = Math.max(1, Math.ceil(w * imgSize.width))
  const rawHeight = Math.max(1, Math.ceil(h * imgSize.height))
  const width = Math.min(imgSize.width - left, rawWidth)
  const height = Math.min(imgSize.height - top, rawHeight)

  if (width <= 0 || height <= 0) {
    // 理论不应触发——clamp 已保证至少 1 像素
    throw new Error(
      `cropFromBbox: zero-area after clamp ${JSON.stringify(bbox)} on ${imgSize.width}x${imgSize.height}`,
    )
  }
  return sharp(rawBuffer).extract({ left, top, width, height }).png().toBuffer()
}
