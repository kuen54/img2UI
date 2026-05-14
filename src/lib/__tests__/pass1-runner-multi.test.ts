// Phase 8b Task 8b.7:Pass 1 5 路并行 + IoU 合并 + ≥3/5 容忍
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/llm-client', () => ({
  callMllm: vi.fn(),
}))
vi.mock('@/lib/states', () => ({
  getState: vi.fn(),
  setPipelineStatus: vi.fn(),
  listStatesByPage: vi.fn(),
}))
vi.mock('@/lib/pages', () => ({ getPage: vi.fn() }))
vi.mock('@/lib/projects', () => ({ getProject: vi.fn() }))
vi.mock('@/lib/elements', () => ({
  getElementsByPage: vi.fn().mockResolvedValue([]),
  saveElementsForPage: vi.fn(),
}))
vi.mock('@/lib/pipelines', () => ({
  createRun: vi.fn().mockImplementation(() => Promise.resolve({ id: 'run_x' })),
  completeRun: vi.fn(),
  failRun: vi.fn(),
}))
vi.mock('@/lib/config', () => ({
  loadConfig: vi.fn().mockResolvedValue({
    providers: [
      {
        id: 'p1',
        kind: 'mllm',
        active: true,
        model: 'g',
        api_key: 'k',
        api_format: 'sankuai',
      },
    ],
    prompts: { pass1_layout: 'BASE PROMPT' },
  }),
}))
vi.mock('node:fs', async () => {
  const real = await vi.importActual<typeof import('node:fs')>('node:fs')
  return {
    ...real,
    promises: {
      ...real.promises,
      readFile: vi.fn().mockResolvedValue(Buffer.from('fake-png')),
    },
  }
})

import { runPass1 } from '@/lib/pass1-runner'
import { callMllm } from '@/lib/llm-client'
import { getState, listStatesByPage } from '@/lib/states'
import { getPage } from '@/lib/pages'
import { getProject } from '@/lib/projects'
import { saveElementsForPage, getElementsByPage } from '@/lib/elements'

describe('runPass1 multi-route', () => {
  beforeEach(() => {
    vi.mocked(getState).mockResolvedValue({
      id: 'st1',
      page_id: 'pg1',
      name: 'canonical',
      original_image_path: '/x',
      width: 100,
      height: 100,
      pipeline_status: 'idle',
      created_at: '',
    } as never)
    vi.mocked(getPage).mockResolvedValue({
      id: 'pg1',
      project_id: 'pj1',
      name: 'p',
      canonical_state_id: 'st1',
      created_at: '',
      updated_at: '',
    } as never)
    vi.mocked(getProject).mockResolvedValue({
      id: 'pj1',
      name: 'proj',
      created_at: '',
      updated_at: '',
    } as never)
    vi.mocked(listStatesByPage).mockResolvedValue([
      {
        id: 'st1',
        page_id: 'pg1',
        name: 'canonical',
        original_image_path: '/x',
        width: 100,
        height: 100,
        pipeline_status: 'idle',
        created_at: '',
      },
    ] as never)
    vi.mocked(getElementsByPage).mockResolvedValue([])
    vi.mocked(callMllm).mockReset()
    vi.mocked(saveElementsForPage).mockReset()
  })

  it('calls 5 routes in parallel and merges', async () => {
    vi.mocked(callMllm).mockImplementation(async (_, opts) => {
      const sysContent = String(opts.messages[0]!.content)
      const m = sysContent.match(/\[(\w+) PASS/)
      const cat = m![1]!.toLowerCase()
      // 给每路一个不重叠的 bbox(分别在 5 个不同区域)
      const bboxByCat: Record<string, [number, number, number, number]> = {
        subject: [0.1, 0.1, 0.2, 0.2],
        button: [0.4, 0.1, 0.1, 0.1],
        container: [0.7, 0.1, 0.2, 0.2],
        background: [0.1, 0.7, 0.8, 0.2],
        decoration: [0.4, 0.4, 0.1, 0.1],
      }
      return {
        content: JSON.stringify({
          elements: [
            {
              entity_name: `${cat}_el`,
              type: 'static',
              bbox: bboxByCat[cat],
              description: `${cat} element`,
            },
          ],
        }),
      }
    })

    await runPass1('st1')
    expect(callMllm).toHaveBeenCalledTimes(5)
    expect(saveElementsForPage).toHaveBeenCalled()
    const saved = vi.mocked(saveElementsForPage).mock.calls[0]![1]
    // 5 路每路 1 个不重叠元素 → 全合并保留
    expect(saved.length).toBe(5)
    // 每个 element 都带 visual_category(不能是 'other' 兜底——是各路的 category)
    const cats = saved.map((e) => e.visual_category).sort()
    expect(cats).toEqual([
      'background',
      'button',
      'container',
      'decoration',
      'subject',
    ])
  })

  it('tolerates 2 route failures (>=3/5 OK)', async () => {
    let callIdx = 0
    vi.mocked(callMllm).mockImplementation(async () => {
      callIdx++
      if (callIdx <= 2) throw new Error('mock route failed')
      return {
        content: JSON.stringify({
          elements: [
            {
              entity_name: `el_${callIdx}`,
              type: 'static',
              bbox: [0.1 * callIdx, 0.1, 0.05, 0.05],
              description: 'x',
            },
          ],
        }),
      }
    })

    await expect(runPass1('st1')).resolves.toBeDefined()
    expect(callMllm).toHaveBeenCalledTimes(5)
    expect(saveElementsForPage).toHaveBeenCalled()
  })

  it('fails when only 2/5 routes succeed', async () => {
    let callIdx = 0
    vi.mocked(callMllm).mockImplementation(async () => {
      callIdx++
      if (callIdx <= 3) throw new Error('mock route failed')
      return {
        content: JSON.stringify({ elements: [] }),
      }
    })

    await expect(runPass1('st1')).rejects.toThrow(/Pass 1 多路失败/)
  })
})
