import { describe, it, expect } from 'vitest'
import { mergeRoutes } from '@/lib/pass1-route-merger'

const mkEl = (name: string, bbox: [number,number,number,number], type: 'static' | 'code' = 'static') => ({
  entity_name: name,
  type,
  bbox,
  description: name,
  z_index: 0,
})

describe('mergeRoutes', () => {
  it('single route: keeps all elements', () => {
    const out = mergeRoutes([{ category: 'subject', elements: [mkEl('hero', [0,0,0.5,0.5])] }])
    expect(out).toHaveLength(1)
    expect(out[0]!.visual_category).toBe('subject')
    expect(out[0]!.pass1_routes_seen).toEqual(['subject'])
  })

  it('cross-route same physical element (IoU > 0.5): keeps higher priority', () => {
    const out = mergeRoutes([
      { category: 'decoration', elements: [mkEl('hero_a', [0,0,0.5,0.5])] },
      { category: 'subject', elements: [mkEl('hero_b', [0.01,0.01,0.49,0.49])] },
    ])
    expect(out).toHaveLength(1)
    expect(out[0]!.visual_category).toBe('subject')
    expect(out[0]!.pass1_routes_seen).toContain('subject')
    expect(out[0]!.pass1_routes_seen).toContain('decoration')
  })

  it('disjoint elements: keeps all', () => {
    const out = mergeRoutes([
      { category: 'subject', elements: [mkEl('a', [0,0,0.2,0.2])] },
      { category: 'decoration', elements: [mkEl('b', [0.5,0.5,0.2,0.2])] },
    ])
    expect(out).toHaveLength(2)
  })

  it('triple-route hit: pass1_routes_seen has 3 entries, takes highest priority', () => {
    const out = mergeRoutes([
      { category: 'background', elements: [mkEl('x', [0,0,1,1])] },
      { category: 'container', elements: [mkEl('x', [0,0,1,1])] },
      { category: 'subject', elements: [mkEl('x', [0,0,1,1])] },
    ])
    expect(out).toHaveLength(1)
    expect(out[0]!.visual_category).toBe('subject')
    expect(out[0]!.pass1_routes_seen).toHaveLength(3)
  })

  it('handles empty input', () => {
    expect(mergeRoutes([])).toEqual([])
  })

  it('IoU below 0.5 treated as separate elements', () => {
    const out = mergeRoutes([
      { category: 'decoration', elements: [mkEl('a', [0,0,2,2])] },
      // IoU = 1/7 ≈ 0.14
      { category: 'subject', elements: [mkEl('b', [1,1,2,2])] },
    ])
    expect(out).toHaveLength(2)
  })
})
