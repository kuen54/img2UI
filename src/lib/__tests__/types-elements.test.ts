import { describe, it, expect } from 'vitest'
import type { Element, PipelinePassKind } from '@/lib/types'

describe('Element type', () => {
  it('accepts visual_category', () => {
    const el: Element = {
      id: 'x', page_id: 'p', state_ids: ['s'], name: 'n',
      type: 'static',
      visual_category: 'subject',
      bbox: [0, 0, 0.5, 0.5], z_index: 0, description: '',
      reviewed: false, created_at: '', updated_at: '',
    }
    expect(el.visual_category).toBe('subject')
  })

  it('accepts pass1_routes_seen as optional', () => {
    const el: Element = {
      id: 'x', page_id: 'p', state_ids: ['s'], name: 'n',
      type: 'static', visual_category: 'decoration',
      bbox: [0, 0, 1, 1], z_index: 0, description: '',
      pass1_routes_seen: ['decoration', 'subject'],
      reviewed: false, created_at: '', updated_at: '',
    }
    expect(el.pass1_routes_seen).toHaveLength(2)
  })
})

describe('PipelinePassKind', () => {
  it('accepts pass1_subject / pass2_decoration sub-kinds', () => {
    const a: PipelinePassKind = 'pass1_subject'
    const b: PipelinePassKind = 'pass2_decoration'
    expect(a).toBe('pass1_subject')
    expect(b).toBe('pass2_decoration')
  })

  it('keeps legacy pass1 / pass2 / validate / re_extract', () => {
    const a: PipelinePassKind = 'pass1'
    const b: PipelinePassKind = 'pass2'
    const c: PipelinePassKind = 'validate'
    const d: PipelinePassKind = 're_extract'
    expect([a, b, c, d]).toEqual(['pass1', 'pass2', 'validate', 're_extract'])
  })
})
