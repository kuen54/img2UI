// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ElementList } from '@/components/element-review/element-list'
import { getBboxWarning } from '@/components/element-review/bbox-warning'
import type { Element, State } from '@/lib/types'

const states: State[] = [
  {
    id: 's',
    page_id: 'p',
    name: 's1',
    original_image_path: '',
    width: 100,
    height: 100,
    pipeline_status: 'idle',
    created_at: '',
  },
]

const baseEl = {
  type: 'static' as const,
  visual_category: 'subject' as const,
  z_index: 0,
  description: '',
  state_ids: ['s'],
  page_id: 'p',
  reviewed: false,
  created_at: '',
  updated_at: '',
}

describe('getBboxWarning', () => {
  it('returns error when bbox extends past x+w > 1', () => {
    const w = getBboxWarning({
      ...baseEl,
      id: 'a',
      name: 'A',
      bbox: [0.9, 0.5, 0.2, 0.1],
    })
    expect(w.level).toBe('error')
    expect(w.reason).toMatch(/越界/)
  })

  it('returns error when bbox extends past y+h > 1', () => {
    const w = getBboxWarning({
      ...baseEl,
      id: 'a',
      name: 'A',
      bbox: [0.5, 0.9, 0.1, 0.2],
    })
    expect(w.level).toBe('error')
  })

  it('tolerates floating-point slop within 0.001', () => {
    const w = getBboxWarning({
      ...baseEl,
      id: 'a',
      name: 'A',
      bbox: [0.0, 0.0, 1.0005, 1.0],
    })
    // 精度容忍,不算越界
    expect(w.level).not.toBe('error')
  })

  it('returns warning for single-route element', () => {
    const w = getBboxWarning({
      ...baseEl,
      id: 'a',
      name: 'A',
      bbox: [0.1, 0.1, 0.3, 0.3],
      pass1_routes_seen: ['route_a'],
    })
    expect(w.level).toBe('warning')
    expect(w.reason).toMatch(/单路/)
  })

  it('returns null when element seen by multiple routes', () => {
    const w = getBboxWarning({
      ...baseEl,
      id: 'a',
      name: 'A',
      bbox: [0.1, 0.1, 0.3, 0.3],
      pass1_routes_seen: ['route_a', 'route_b'],
    })
    expect(w.level).toBeNull()
  })

  it('returns warning for extreme aspect ratio > 20:1', () => {
    const w = getBboxWarning({
      ...baseEl,
      id: 'a',
      name: 'A',
      bbox: [0, 0, 0.5, 0.02], // 25:1
    })
    expect(w.level).toBe('warning')
    expect(w.reason).toMatch(/长宽比/)
  })

  it('returns warning for zero area bbox', () => {
    const w = getBboxWarning({
      ...baseEl,
      id: 'a',
      name: 'A',
      bbox: [0.5, 0.5, 0.001, 0.001],
    })
    expect(w.level).toBe('warning')
    expect(w.reason).toMatch(/面积/)
  })

  it('error takes priority over warning when both apply', () => {
    const w = getBboxWarning({
      ...baseEl,
      id: 'a',
      name: 'A',
      // 越界 + 单路同时
      bbox: [0.9, 0.5, 0.2, 0.1],
      pass1_routes_seen: ['route_a'],
    })
    expect(w.level).toBe('error')
  })

  it('returns null for normal bbox', () => {
    const w = getBboxWarning({
      ...baseEl,
      id: 'a',
      name: 'A',
      bbox: [0.1, 0.1, 0.3, 0.3],
    })
    expect(w.level).toBeNull()
  })
})

describe('ElementList renders bbox warning icons', () => {
  it('shows error icon for out-of-bounds element', () => {
    const els: Element[] = [
      {
        ...baseEl,
        id: 'a',
        name: 'OutOfBounds',
        bbox: [0.9, 0.5, 0.2, 0.1],
      },
    ]
    render(
      <ElementList
        elements={els}
        states={states}
        selectedId={null}
        onSelect={() => {}}
        onAddManual={() => {}}
      />,
    )
    // 通过 title 文案断言 warning
    const icon = screen.getByLabelText(/bbox 越界/)
    expect(icon).toBeInTheDocument()
  })

  it('shows warning icon for single-route element', () => {
    const els: Element[] = [
      {
        ...baseEl,
        id: 'a',
        name: 'SingleRoute',
        bbox: [0.1, 0.1, 0.3, 0.3],
        pass1_routes_seen: ['route_a'],
      },
    ]
    render(
      <ElementList
        elements={els}
        states={states}
        selectedId={null}
        onSelect={() => {}}
        onAddManual={() => {}}
      />,
    )
    const icon = screen.getByLabelText(/仅单路识别/)
    expect(icon).toBeInTheDocument()
  })

  it('does not render any icon for normal element', () => {
    const els: Element[] = [
      {
        ...baseEl,
        id: 'a',
        name: 'Normal',
        bbox: [0.1, 0.1, 0.3, 0.3],
        pass1_routes_seen: ['route_a', 'route_b'],
      },
    ]
    render(
      <ElementList
        elements={els}
        states={states}
        selectedId={null}
        onSelect={() => {}}
        onAddManual={() => {}}
      />,
    )
    expect(screen.queryByLabelText(/越界/)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/单路/)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/长宽比/)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/面积过小/)).not.toBeInTheDocument()
  })
})
