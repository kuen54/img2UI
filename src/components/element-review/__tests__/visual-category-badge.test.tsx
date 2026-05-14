// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { VisualCategoryBadge } from '@/components/element-review/visual-category-badge'

describe('VisualCategoryBadge', () => {
  it.each([
    ['subject', '主体'],
    ['button', '按钮'],
    ['container', '容器'],
    ['background', '背景'],
    ['decoration', '装饰'],
    ['other', '其他'],
  ] as const)('renders %s with Chinese label %s', (cat, cn) => {
    const { container } = render(<VisualCategoryBadge category={cat} />)
    expect(container.textContent).toContain(cn)
  })
})
