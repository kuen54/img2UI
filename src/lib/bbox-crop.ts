// 从原图按归一化 bbox 用 sharp.extract 切出 sub-region
// Phase 8c:Pass 2 多参考图所需,每个 element 一张 crop 喂给 image_gen
// 越界 bbox 自动 clamp 到图像内,零面积/完全越界抛错

import sharp from 'sharp'
import type { Bbox } from '@/lib/bbox-iou'

export async function cropFromBbox(
  rawBuffer: Buffer,
  bbox: Bbox,
  imgSize: { width: number; height: number },
): Promise<Buffer> {
  const [x, y, w, h] = bbox
  const left = Math.max(0, Math.floor(x * imgSize.width))
  const top = Math.max(0, Math.floor(y * imgSize.height))
  const widthRaw = Math.ceil(w * imgSize.width)
  const heightRaw = Math.ceil(h * imgSize.height)
  const width = Math.min(imgSize.width - left, widthRaw)
  const height = Math.min(imgSize.height - top, heightRaw)

  if (width <= 0 || height <= 0) {
    throw new Error(
      `cropFromBbox: zero-area bbox ${JSON.stringify(bbox)} on ${imgSize.width}x${imgSize.height}`,
    )
  }
  return sharp(rawBuffer).extract({ left, top, width, height }).png().toBuffer()
}
