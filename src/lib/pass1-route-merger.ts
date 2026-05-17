// HANDOFF §5.2 / §13.8:5 路 Pass 1 输出合并
// IoU > 0.5 视为同一物理元素;冲突按优先级(subject<button<container<background<decoration<other)取胜出 category。
// 被合并掉的路次把 category 加到 winner 的 pass1_routes_seen[],debug 用。

import type { LayoutElement, VisualCategory } from './types'
import { iou } from './bbox-iou'
import { VISUAL_CATEGORY_PRIORITY } from './visual-category'

export interface RouteResult {
  category: VisualCategory
  elements: LayoutElement[]
}

const IOU_THRESHOLD = 0.5

/**
 * 合并多路 Pass 1 输出。
 * - 同一物理元素(IoU > 0.5)用 visual_category 优先级取胜出
 * - 同 cluster 的所有路次 category 都加到 pass1_routes_seen[]
 * - winner 取胜出路次提供的 element 数据(name / description / type 等)
 */
export function mergeRoutes(routes: RouteResult[]): LayoutElement[] {
  // 把所有 element 平铺,并打个 routeCategory 标记
  type Tagged = { el: LayoutElement; routeCategory: VisualCategory }
  const all: Tagged[] = []
  for (const r of routes) {
    for (const el of r.elements) {
      all.push({ el, routeCategory: r.category })
    }
  }
  if (all.length === 0) return []

  // Union-find 把 IoU > 0.5 的 elements 聚成 cluster
  const parent: number[] = all.map((_, i) => i)
  const find = (x: number): number => {
    let r = x
    while (parent[r] !== r) r = parent[r]!
    // path compression
    while (parent[x] !== r) {
      const p = parent[x]!
      parent[x] = r
      x = p
    }
    return r
  }
  const union = (a: number, b: number): void => {
    const ra = find(a), rb = find(b)
    if (ra !== rb) parent[ra] = rb
  }

  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      if (iou(all[i]!.el.bbox, all[j]!.el.bbox) > IOU_THRESHOLD) {
        union(i, j)
      }
    }
  }

  // 按 cluster root 分组
  const clusters = new Map<number, Tagged[]>()
  for (let i = 0; i < all.length; i++) {
    const root = find(i)
    let arr = clusters.get(root)
    if (!arr) {
      arr = []
      clusters.set(root, arr)
    }
    arr.push(all[i]!)
  }

  // 每个 cluster 选 winner:visual_category 优先级最高(数字最小)
  // 同优先级时取 bbox 面积最大的(更可能是真实物理元素)
  const merged: LayoutElement[] = []
  for (const cluster of clusters.values()) {
    const sorted = [...cluster].sort((a, b) => {
      const pa = VISUAL_CATEGORY_PRIORITY[a.el.visual_category]
      const pb = VISUAL_CATEGORY_PRIORITY[b.el.visual_category]
      if (pa !== pb) return pa - pb
      const areaA = a.el.bbox[2] * a.el.bbox[3]
      const areaB = b.el.bbox[2] * b.el.bbox[3]
      return areaB - areaA
    })
    const winner = sorted[0]!
    const seen = Array.from(new Set(cluster.map((c) => c.routeCategory)))
    merged.push({
      ...winner.el,
      pass1_routes_seen: seen,
    })
  }

  // 按 z_index 升序、然后 y → x 排序,UI 列表稳定
  merged.sort((a, b) => {
    if (a.z_index !== b.z_index) return a.z_index - b.z_index
    if (a.bbox[1] !== b.bbox[1]) return a.bbox[1] - b.bbox[1]
    return a.bbox[0] - b.bbox[0]
  })

  return merged
}
