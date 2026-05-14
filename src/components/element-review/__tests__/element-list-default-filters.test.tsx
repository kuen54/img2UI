// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
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
  z_index: 0,
  description: '',
  state_ids: ['s'],
  page_id: 'p',
  reviewed: false,
  created_at: '',
  updated_at: '',
}

// 4 elements covering the matrix:
//   STATIC_BIG       —— static + 大面积 (默认应可见)
//   STATIC_SMALL     —— static + 极小面积 < 0.5% (默认隐藏)
//   CODE_BIG         —— code + 大面积 (默认隐藏,因为 showOnlyStatic)
//   CODE_SMALL       —— code + 小面积 (默认隐藏)
const els: Element[] = [
  {
    id: 'a',
    name: 'StaticBig',
    type: 'static',
    visual_category: 'subject',
    bbox: [0, 0, 0.5, 0.5], // 25% area
    ...baseEl,
  },
  {
    id: 'b',
    name: 'StaticSmall',
    type: 'static',
    visual_category: 'decoration',
    bbox: [0, 0, 0.05, 0.05], // 0.25% area < 0.5%
    ...baseEl,
  },
  {
    id: 'c',
    name: 'CodeBig',
    type: 'code',
    visual_category: 'container',
    bbox: [0, 0, 0.6, 0.6], // 36% area
    ...baseEl,
  },
  {
    id: 'd',
    name: 'CodeSmall',
    type: 'code',
    visual_category: 'other',
    bbox: [0, 0, 0.04, 0.04], // 0.16% area
    ...baseEl,
  },
]

describe('ElementList default filters', () => {
  it('hides type=code elements by default (showOnlyStatic ON)', () => {
    render(
      <ElementList
        elements={els}
        states={states}
        selectedId={null}
        onSelect={() => {}}
        onAddManual={() => {}}
      />,
    )
    expect(screen.getByText('StaticBig')).toBeInTheDocument()
    expect(screen.queryByText('CodeBig')).not.toBeInTheDocument()
    expect(screen.queryByText('CodeSmall')).not.toBeInTheDocument()
  })

  it('hides elements smaller than 0.5% by default (hideSmallElements ON)', () => {
    render(
      <ElementList
        elements={els}
        states={states}
        selectedId={null}
        onSelect={() => {}}
        onAddManual={() => {}}
      />,
    )
    expect(screen.queryByText('StaticSmall')).not.toBeInTheDocument()
  })

  it('shows summary "显示 N / total"', () => {
    render(
      <ElementList
        elements={els}
        states={states}
        selectedId={null}
        onSelect={() => {}}
        onAddManual={() => {}}
      />,
    )
    expect(screen.getByText(/显示 1 \/ 4/)).toBeInTheDocument()
  })

  it('"显示全部" button reveals all elements when filtered', () => {
    render(
      <ElementList
        elements={els}
        states={states}
        selectedId={null}
        onSelect={() => {}}
        onAddManual={() => {}}
      />,
    )
    fireEvent.click(screen.getByText('显示全部'))
    expect(screen.getByText('StaticBig')).toBeInTheDocument()
    expect(screen.getByText('StaticSmall')).toBeInTheDocument()
    expect(screen.getByText('CodeBig')).toBeInTheDocument()
    expect(screen.getByText('CodeSmall')).toBeInTheDocument()
    expect(screen.getByText(/显示 4 \/ 4/)).toBeInTheDocument()
  })

  it('「显示全部」 button is hidden when no items are filtered out', () => {
    render(
      <ElementList
        elements={[els[0]!]} // only StaticBig
        states={states}
        selectedId={null}
        onSelect={() => {}}
        onAddManual={() => {}}
      />,
    )
    expect(screen.queryByText('显示全部')).not.toBeInTheDocument()
  })

  it('toggling 「只看静态切图」 OFF reveals code elements (small filter still ON)', () => {
    render(
      <ElementList
        elements={els}
        states={states}
        selectedId={null}
        onSelect={() => {}}
        onAddManual={() => {}}
      />,
    )
    const onlyStaticCb = screen.getByLabelText('只看静态切图') as HTMLInputElement
    expect(onlyStaticCb.checked).toBe(true)
    fireEvent.click(onlyStaticCb)

    // CodeBig now visible (大面积);CodeSmall + StaticSmall 仍隐藏(小碎片 filter 还 ON)
    expect(screen.getByText('CodeBig')).toBeInTheDocument()
    expect(screen.getByText('StaticBig')).toBeInTheDocument()
    expect(screen.queryByText('CodeSmall')).not.toBeInTheDocument()
    expect(screen.queryByText('StaticSmall')).not.toBeInTheDocument()
  })

  it('toggling 「隐藏小碎片」 OFF reveals small elements (static filter still ON)', () => {
    render(
      <ElementList
        elements={els}
        states={states}
        selectedId={null}
        onSelect={() => {}}
        onAddManual={() => {}}
      />,
    )
    const hideSmallCb = screen.getByLabelText('隐藏小碎片') as HTMLInputElement
    expect(hideSmallCb.checked).toBe(true)
    fireEvent.click(hideSmallCb)

    expect(screen.getByText('StaticBig')).toBeInTheDocument()
    expect(screen.getByText('StaticSmall')).toBeInTheDocument()
    expect(screen.queryByText('CodeBig')).not.toBeInTheDocument()
    expect(screen.queryByText('CodeSmall')).not.toBeInTheDocument()
  })
})
