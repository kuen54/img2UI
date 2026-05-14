// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ElementList } from '@/components/element-review/element-list'
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
  bbox: [0, 0, 1, 1] as [number, number, number, number],
  z_index: 0,
  description: '',
  state_ids: ['s'],
  page_id: 'p',
  reviewed: false,
  created_at: '',
  updated_at: '',
}

const els: Element[] = [
  { id: 'a', name: 'A', visual_category: 'subject', ...baseEl },
  { id: 'b', name: 'B', visual_category: 'decoration', ...baseEl },
]

describe('ElementList filter by visual_category', () => {
  it('renders all elements by default and shows visual_category badge', () => {
    render(
      <ElementList
        elements={els}
        states={states}
        selectedId={null}
        onSelect={() => {}}
        onAddManual={() => {}}
      />,
    )
    expect(screen.getByText('A')).toBeInTheDocument()
    expect(screen.getByText('B')).toBeInTheDocument()
    // 列表项里至少一个 badge "主体"(A 的)
    expect(screen.getAllByText('主体').length).toBeGreaterThanOrEqual(1)
  })

  it('filters by category when toggle unchecked', () => {
    render(
      <ElementList
        elements={els}
        states={states}
        selectedId={null}
        onSelect={() => {}}
        onAddManual={() => {}}
      />,
    )
    // 取消「装饰」筛选 checkbox(顶部筛选区有 6 个 checkbox)
    const decorationCheckbox = screen.getByLabelText('装饰') as HTMLInputElement
    expect(decorationCheckbox.checked).toBe(true)
    fireEvent.click(decorationCheckbox)
    expect(screen.queryByText('B')).not.toBeInTheDocument()
    expect(screen.getByText('A')).toBeInTheDocument()
  })

  it('calls onSelect when list item clicked', () => {
    const onSelect = vi.fn()
    render(
      <ElementList
        elements={els}
        states={states}
        selectedId={null}
        onSelect={onSelect}
        onAddManual={() => {}}
      />,
    )
    fireEvent.click(screen.getByText('A'))
    expect(onSelect).toHaveBeenCalledWith('a')
  })
})
