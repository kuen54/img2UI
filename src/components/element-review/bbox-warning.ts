import type { Element } from '@/lib/types'

export type BboxWarning = {
  level: 'error' | 'warning' | null
  reason?: string
}

// 0.001 容忍 LLM 输出的浮点精度
const BOUND_SLOP = 0.001
const MIN_AREA = 0.0001
const MAX_ASPECT_RATIO = 20

// 4 种 warning 检测;error 优先级高于 warning
export function getBboxWarning(el: Element): BboxWarning {
  const [x, y, w, h] = el.bbox

  // 严重:bbox 越界
  if (x + w > 1 + BOUND_SLOP || y + h > 1 + BOUND_SLOP) {
    return { level: 'error', reason: 'bbox 越界,Pass 2 已 clamp 但位置可能不准' }
  }

  // 提示:仅单路识别
  if (el.pass1_routes_seen && el.pass1_routes_seen.length === 1) {
    return { level: 'warning', reason: '仅单路识别,建议确认' }
  }

  // 提示:形状异常
  if (w > 0 && h > 0) {
    const ratio = Math.max(w / h, h / w)
    if (ratio > MAX_ASPECT_RATIO) {
      return { level: 'warning', reason: '长宽比极端,可能误识别' }
    }
  }

  // 提示:零面积
  if (w * h < MIN_AREA) {
    return { level: 'warning', reason: '面积过小,可能不是真实元素' }
  }

  return { level: null }
}
