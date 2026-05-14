// 合并 5 路 Pass 1 结果:同一物理元素被多路识别时,按优先级取胜出 category,
// 多路命中累加到 pass1_routes_seen(debug 用)。
// 阈值 0.5 IoU(Phase 8b plan 锁定)。
import type { Element } from '@/lib/types'
import { type VisualCategory, VISUAL_CATEGORY_PRIORITY } from '@/lib/visual-category'
import { bboxIoU, type Bbox } from '@/lib/bbox-iou'
import { newElementId } from '@/lib/id'

// 来自单路 LLM 的元素(未带 visual_category — 由 caller route 提供)
export type RouteElement = {
  entity_name: string
  type: 'static' | 'code'
  type_reasoning?: string
  bbox: Bbox
  z_index?: number
  description: string
  shape_spec?: string
  material_spec?: string
  cross_state_notes?: string
  appears_in_states?: string[]
}

export type RouteResult = {
  category: VisualCategory
  elements: RouteElement[]
}

const IOU_MERGE_THRESHOLD = 0.5

// 合并后还缺 page_id / state_ids / reviewed / timestamps,由 caller (pass1-runner) 补全
type MergedElement = Omit<Element, 'page_id' | 'state_ids' | 'reviewed' | 'created_at' | 'updated_at'>

export function mergeRoutes(results: RouteResult[]): MergedElement[] {
  // 展平 + 按优先级排序(高优先级先占位 → 后续 dup 找到时,优先级低的不会 overwrite)
  const flat = results.flatMap((r) => r.elements.map((el) => ({ el, category: r.category })))
  flat.sort((a, b) =>
    VISUAL_CATEGORY_PRIORITY[a.category] - VISUAL_CATEGORY_PRIORITY[b.category]
  )

  const merged: MergedElement[] = []

  for (const { el, category } of flat) {
    const dup = merged.find((m) => bboxIoU(m.bbox, el.bbox) > IOU_MERGE_THRESHOLD)
    if (dup) {
      // 优先级低,丢弃元素本体,只把 category 加入 pass1_routes_seen
      if (!dup.pass1_routes_seen) dup.pass1_routes_seen = []
      if (!dup.pass1_routes_seen.includes(category)) dup.pass1_routes_seen.push(category)
    } else {
      merged.push({
        id: newElementId(),
        name: el.entity_name,
        type: el.type === 'code' ? 'code' : 'static',
        visual_category: category,
        bbox: el.bbox,
        z_index: typeof el.z_index === 'number' ? el.z_index : 0,
        description: el.description,
        ...(el.shape_spec ? { shape_spec: el.shape_spec } : {}),
        ...(el.material_spec ? { material_spec: el.material_spec } : {}),
        ...(el.cross_state_notes ? { cross_state_notes: el.cross_state_notes } : {}),
        pass1_routes_seen: [category],
      })
    }
  }
  return merged
}
