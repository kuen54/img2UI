import type { BBox } from './types'

/** HANDOFF §5.2:bbox 重叠度 IoU(归一化坐标) */
export function iou(a: BBox, b: BBox): number {
  const [ax, ay, aw, ah] = a
  const [bx, by, bw, bh] = b
  const x1 = Math.max(ax, bx)
  const y1 = Math.max(ay, by)
  const x2 = Math.min(ax + aw, bx + bw)
  const y2 = Math.min(ay + ah, by + bh)
  if (x2 <= x1 || y2 <= y1) return 0
  const inter = (x2 - x1) * (y2 - y1)
  const union = aw * ah + bw * bh - inter
  return inter / union
}

/** clamp 单个分量到 [0, 1] */
function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v))
}

/** clamp bbox 让 x+w ≤ 1 / y+h ≤ 1 */
export function clampBbox01(box: BBox): BBox {
  let [x, y, w, h] = box
  x = clamp01(x)
  y = clamp01(y)
  w = clamp01(w)
  h = clamp01(h)
  if (x + w > 1) w = 1 - x
  if (y + h > 1) h = 1 - y
  return [x, y, w, h] as const
}

/** bbox 相对面积(归一化坐标) */
export function bboxArea(box: BBox): number {
  return box[2] * box[3]
}
