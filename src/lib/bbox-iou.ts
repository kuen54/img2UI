// IoU(intersection over union)— 用于 Phase 8b 多路 Pass 1 元素合并去重
// bbox 格式: [x, y, w, h](归一化或像素均可,只要两边一致)
// 退化输入(零面积)直接返回 0,避免下游除 0
export type Bbox = [number, number, number, number]

export function bboxIoU(a: Bbox, b: Bbox): number {
  const [ax, ay, aw, ah] = a
  const [bx, by, bw, bh] = b
  if (aw <= 0 || ah <= 0 || bw <= 0 || bh <= 0) return 0

  const ix1 = Math.max(ax, bx)
  const iy1 = Math.max(ay, by)
  const ix2 = Math.min(ax + aw, bx + bw)
  const iy2 = Math.min(ay + ah, by + bh)
  if (ix2 <= ix1 || iy2 <= iy1) return 0

  const inter = (ix2 - ix1) * (iy2 - iy1)
  const union = aw * ah + bw * bh - inter
  return union > 0 ? inter / union : 0
}
