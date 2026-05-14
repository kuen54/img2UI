// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { ElementCanvas } from '@/components/element-review/canvas'

afterEach(cleanup)

const view = { showOutlines: true, showLabels: false, imageOpacity: 1, filter: 'all' as const }

describe('Canvas drag-semantic banner', () => {
  it('shows banner explaining bbox drag affects Pass 2 crop', () => {
    render(
      <ElementCanvas
        imageSrc=""
        imageDims={{ width: 100, height: 100 }}
        currentStateId="s"
        elements={[]}
        selectedId={null}
        onSelect={() => {}}
        onChange={() => {}}
        onCreateRequest={() => {}}
        view={view}
      />,
    )
    // 文案精确匹配 plan §7.1
    expect(screen.getByText(/拖动框/)).toBeInTheDocument()
    expect(screen.getByText(/Pass 2 参考图裁剪/)).toBeInTheDocument()
    expect(screen.getByText(/重跑 Pass 2/)).toBeInTheDocument()
  })
})
