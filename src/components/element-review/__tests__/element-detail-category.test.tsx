// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { ElementDetailPanel } from '@/components/element-review/element-detail-panel'
import { ConfirmProvider } from '@/components/ui/confirm-dialog'
import type { Element, State } from '@/lib/types'

afterEach(cleanup)

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

const el: Element = {
  id: 'a',
  name: 'A',
  visual_category: 'decoration',
  type: 'static',
  bbox: [0, 0, 1, 1],
  z_index: 0,
  description: '',
  state_ids: ['s'],
  page_id: 'p',
  reviewed: false,
  created_at: '',
  updated_at: '',
}

function renderWithProvider(ui: React.ReactElement) {
  return render(<ConfirmProvider>{ui}</ConfirmProvider>)
}

describe('ElementDetailPanel visual_category select', () => {
  it('renders 6 visual_category options with current value selected', () => {
    renderWithProvider(
      <ElementDetailPanel element={el} states={states} onChange={() => {}} onDelete={() => {}} />,
    )
    const select = screen.getByLabelText('视觉类别') as HTMLSelectElement
    expect(select.value).toBe('decoration')
    expect(select.querySelectorAll('option').length).toBe(6)
  })

  it('changing select calls onChange with new visual_category', () => {
    const onChange = vi.fn()
    renderWithProvider(
      <ElementDetailPanel element={el} states={states} onChange={onChange} onDelete={() => {}} />,
    )
    fireEvent.change(screen.getByLabelText('视觉类别'), { target: { value: 'subject' } })
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ visual_category: 'subject' }),
    )
  })
})
