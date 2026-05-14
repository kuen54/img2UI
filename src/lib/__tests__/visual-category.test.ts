import { describe, it, expect } from 'vitest'
import {
  VISUAL_CATEGORIES,
  VISUAL_CATEGORY_PRIORITY,
  VISUAL_CATEGORY_EXAMPLES_CN,
  visualCategoryCn,
  type VisualCategory,
} from '@/lib/visual-category'

describe('visual-category', () => {
  it('exposes 5 categories + other', () => {
    expect(VISUAL_CATEGORIES).toEqual([
      'subject', 'button', 'container', 'background', 'decoration', 'other',
    ])
  })

  it('priority order: subject > button > container > background > decoration > other', () => {
    expect(VISUAL_CATEGORY_PRIORITY['subject']).toBeLessThan(VISUAL_CATEGORY_PRIORITY['button'])
    expect(VISUAL_CATEGORY_PRIORITY['button']).toBeLessThan(VISUAL_CATEGORY_PRIORITY['container'])
    expect(VISUAL_CATEGORY_PRIORITY['container']).toBeLessThan(VISUAL_CATEGORY_PRIORITY['background'])
    expect(VISUAL_CATEGORY_PRIORITY['background']).toBeLessThan(VISUAL_CATEGORY_PRIORITY['decoration'])
    expect(VISUAL_CATEGORY_PRIORITY['decoration']).toBeLessThan(VISUAL_CATEGORY_PRIORITY['other'])
  })

  it('exposes Chinese label', () => {
    expect(visualCategoryCn('subject')).toBe('主体')
    expect(visualCategoryCn('decoration')).toBe('装饰')
    expect(visualCategoryCn('other')).toBe('其他')
  })

  it('decoration examples mention small text label badges (PoC #2 v3 anchoring)', () => {
    expect(VISUAL_CATEGORY_EXAMPLES_CN['decoration']).toContain('购买后自动领取')
    expect(VISUAL_CATEGORY_EXAMPLES_CN['decoration']).toContain('完单可收藏潮玩')
  })

  it('VisualCategory type is exported (compile-time check)', () => {
    const c: VisualCategory = 'subject'
    expect(c).toBe('subject')
  })
})
