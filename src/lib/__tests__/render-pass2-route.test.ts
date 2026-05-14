import { describe, it, expect } from 'vitest'
import type { Element } from '@/lib/types'
import { renderPass2RoutePrompt } from '@/lib/prompts/render-pass2-route'

const mkEl = (
  id: string,
  name: string,
  desc: string,
  cat: Element['visual_category'] = 'decoration',
): Element => ({
  id,
  page_id: 'p',
  state_ids: ['s'],
  name,
  type: 'static',
  visual_category: cat,
  bbox: [0, 0, 0.1, 0.1],
  z_index: 0,
  description: desc,
  reviewed: false,
  created_at: '',
  updated_at: '',
})

describe('renderPass2RoutePrompt', () => {
  it('contains category Chinese label', () => {
    const out = renderPass2RoutePrompt(
      'decoration',
      [mkEl('e1', 'SUPER 徽章', '粉黄椭圆+虚线+星星')],
      '奶茶盲盒抽中页',
    )
    expect(out).toContain('装饰')
    expect(out).toContain('奶茶盲盒抽中页')
  })

  it('numbers references starting from #2 (origin is #1)', () => {
    const els = [mkEl('a', 'A chip', 'a desc'), mkEl('b', 'B chip', 'b desc')]
    const out = renderPass2RoutePrompt('decoration', els, 'page')
    expect(out).toContain('参考图 #2')
    expect(out).toContain('「A chip」')
    expect(out).toContain('参考图 #3')
    expect(out).toContain('「B chip」')
  })

  it('uses soft phrasing (no aggressive words) and mentions chroma green', () => {
    const out = renderPass2RoutePrompt(
      'subject',
      [mkEl('a', 'x', 'y', 'subject')],
      'p',
    )
    expect(out).not.toMatch(/MUST|EXACTLY|TRUST|pixel-faithfully/i)
    expect(out).toContain('记得')
    expect(out).toContain('保持')
    expect(out).toContain('#00FF00')
  })

  it('mentions element count for completeness reminder', () => {
    const els = [mkEl('a', 'a', 'd1'), mkEl('b', 'b', 'd2'), mkEl('c', 'c', 'd3')]
    const out = renderPass2RoutePrompt('decoration', els, 'p')
    expect(out).toContain('共 3 个')
  })

  it('throws when elements list empty', () => {
    expect(() => renderPass2RoutePrompt('subject', [], 'p')).toThrow(/empty/)
  })
})
