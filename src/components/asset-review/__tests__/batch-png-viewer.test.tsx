// @vitest-environment jsdom
// Phase 8g · BatchPngViewer 「用 API 抠图」按钮
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
  },
}))

vi.mock('@/lib/api/assets-client', () => ({
  reKeyViaApiClient: vi.fn(),
}))

import { BatchPngViewer } from '@/components/asset-review/batch-png-viewer'
import { reKeyViaApiClient } from '@/lib/api/assets-client'
import { toast } from 'sonner'

describe('BatchPngViewer · 用 API 抠图 按钮', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('渲染按钮 + Tabs', () => {
    render(<BatchPngViewer stateId="st_1" />)
    expect(screen.getByRole('button', { name: /用 API 抠图/ })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /透明/ })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /绿幕/ })).toBeInTheDocument()
  })

  it('点按钮 → 调 reKeyViaApiClient → toast.success + onReKeyed 调用', async () => {
    vi.mocked(reKeyViaApiClient).mockResolvedValue({
      run_id: 'r1',
      refreshed: 3,
      failed_routes: [],
    })
    const onReKeyed = vi.fn()
    render(<BatchPngViewer stateId="st_1" onReKeyed={onReKeyed} />)

    fireEvent.click(screen.getByRole('button', { name: /用 API 抠图/ }))

    await waitFor(() => {
      expect(reKeyViaApiClient).toHaveBeenCalledWith('st_1')
    })
    await waitFor(() => {
      expect(onReKeyed).toHaveBeenCalled()
    })
    expect(toast.success).toHaveBeenCalledWith(expect.stringMatching(/3 个资产/))
  })

  it('部分失败 → toast.warning 含失败路数', async () => {
    vi.mocked(reKeyViaApiClient).mockResolvedValue({
      run_id: 'r1',
      refreshed: 2,
      failed_routes: [{ category: 'button', error: 'HTTP 500' }],
    })
    render(<BatchPngViewer stateId="st_1" />)

    fireEvent.click(screen.getByRole('button', { name: /用 API 抠图/ }))

    await waitFor(() => {
      expect(toast.warning).toHaveBeenCalledWith(expect.stringMatching(/2 个资产.*1 路失败/))
    })
  })

  it('调用失败 → toast.error', async () => {
    vi.mocked(reKeyViaApiClient).mockRejectedValue(new Error('network down'))
    render(<BatchPngViewer stateId="st_1" />)

    fireEvent.click(screen.getByRole('button', { name: /用 API 抠图/ }))

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/network down/))
    })
  })
})
