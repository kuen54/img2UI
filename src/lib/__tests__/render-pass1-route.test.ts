import { describe, it, expect } from 'vitest'
import { renderPass1RoutePrompt } from '@/lib/prompts/render-pass1-route'

describe('renderPass1RoutePrompt', () => {
  const BASE = 'You are a UI design analyzer. Identify EVERY visible visual element.'

  it('prepends over-include header for subject', () => {
    const out = renderPass1RoutePrompt('subject', BASE)
    expect(out).toContain('[SUBJECT PASS — OVER-INCLUDE MODE]')
    expect(out).toContain('Main visual subject of the page')
    expect(out).toContain('Better to over-include than to miss')
    expect(out).toContain('Cross-route overlaps are FINE')
    expect(out).toContain('IP 角色')   // CATEGORY_EXAMPLES anchoring
    expect(out.endsWith(BASE)).toBe(true)
  })

  it('prepends over-include header for decoration with small-badge anchoring', () => {
    const out = renderPass1RoutePrompt('decoration', BASE)
    expect(out).toContain('[DECORATION PASS — OVER-INCLUDE MODE]')
    expect(out).toContain('购买后自动领取')      // PoC #2 v3 锚定
    expect(out).toContain('完单可收藏潮玩')
  })

  it('removes any "DO NOT return others" anti-pattern (PoC #2 v2 反面教训)', () => {
    const cats = ['subject','button','container','background','decoration'] as const
    for (const c of cats) {
      const out = renderPass1RoutePrompt(c, BASE)
      expect(out).not.toMatch(/DO NOT return.*other categories/i)
      expect(out).not.toMatch(/lean toward NOT returning/i)
    }
  })

  it('5 categories generate distinct prompts', () => {
    const cats = ['subject','button','container','background','decoration'] as const
    const prompts = cats.map(c => renderPass1RoutePrompt(c, BASE))
    const set = new Set(prompts)
    expect(set.size).toBe(5)
  })
})
