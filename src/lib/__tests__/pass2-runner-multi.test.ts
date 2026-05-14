// Phase 8c task 4-6:Pass 2 按 visual_category 分组并行 + 多参考图
// 覆盖:多 category 分组 / multi-ref crops 顺序 / 部分失败容忍 / 切片合并约束
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/llm-client', () => ({ callImageGen: vi.fn() }))
vi.mock('@/lib/states', () => ({
  getState: vi.fn(),
  setPipelineStatus: vi.fn(),
}))
vi.mock('@/lib/pages', () => ({ getPage: vi.fn() }))
vi.mock('@/lib/projects', () => ({ getProject: vi.fn() }))
vi.mock('@/lib/elements', () => ({ getElementsByPage: vi.fn() }))
vi.mock('@/lib/pipelines', () => ({
  createRun: vi.fn().mockImplementation((input: { pass: string }) =>
    Promise.resolve({ id: `run_${input.pass}` }),
  ),
  completeRun: vi.fn(),
  failRun: vi.fn(),
}))
vi.mock('@/lib/config', () => ({
  loadConfig: vi.fn().mockResolvedValue({
    providers: [
      {
        id: 'p',
        kind: 'image_gen',
        active: true,
        model: 'm',
        default_quality: 'high',
        api_format: 'apimart',
        api_key: 'k',
        base_url: '',
        is_async: true,
      },
    ],
    prompts: { pass2_extract: '...' },
  }),
}))
vi.mock('@/lib/alpha-key', () => ({
  chromaGreenKey: vi.fn().mockResolvedValue(Buffer.from('keyed')),
}))
vi.mock('@/lib/slicer', () => ({
  sliceAssets: vi.fn().mockResolvedValue([
    { buffer: Buffer.from('s1'), opaque_pct: 50, bbox: [0, 0, 10, 10] },
    { buffer: Buffer.from('s2'), opaque_pct: 60, bbox: [20, 0, 10, 10] },
  ]),
}))
vi.mock('@/lib/assets', () => ({
  createOrUpdateAsset: vi.fn(),
  writeAssetBinary: vi.fn(),
  patchAsset: vi.fn(),
}))
vi.mock('@/lib/bbox-crop', () => ({
  cropFromBbox: vi.fn().mockImplementation(async (_buf: Buffer, bbox: number[]) =>
    Buffer.from(`crop-${bbox.join(',')}`),
  ),
}))
vi.mock('node:fs', async () => {
  const real = await vi.importActual<typeof import('node:fs')>('node:fs')
  return {
    ...real,
    promises: {
      ...real.promises,
      readFile: vi.fn().mockResolvedValue(Buffer.from('rawpng')),
      writeFile: vi.fn(),
      mkdir: vi.fn(),
    },
  }
})
vi.mock('sharp', () => {
  const m = vi.fn().mockReturnValue({
    metadata: vi.fn().mockResolvedValue({ width: 10, height: 10 }),
  })
  return { default: m }
})

import { runPass2 } from '@/lib/pass2-runner'
import { callImageGen } from '@/lib/llm-client'
import { getState, setPipelineStatus } from '@/lib/states'
import { getPage } from '@/lib/pages'
import { getProject } from '@/lib/projects'
import { getElementsByPage } from '@/lib/elements'
import { createOrUpdateAsset, writeAssetBinary, patchAsset } from '@/lib/assets'
import { sliceAssets } from '@/lib/slicer'

describe('runPass2 multi-route', () => {
  beforeEach(() => {
    vi.mocked(getState).mockResolvedValue({
      id: 'st',
      page_id: 'pg',
      name: 'c',
      original_image_path: '/x',
      width: 100,
      height: 100,
      pipeline_status: 'pass1_done',
      created_at: '',
    } as never)
    vi.mocked(getPage).mockResolvedValue({
      id: 'pg',
      project_id: 'pj',
      name: 'p',
      canonical_state_id: 'st',
      created_at: '',
      updated_at: '',
    } as never)
    vi.mocked(getProject).mockResolvedValue({
      id: 'pj',
      name: 'pr',
      description: '奶茶页',
      created_at: '',
      updated_at: '',
    } as never)
    vi.mocked(callImageGen).mockReset()
    vi.mocked(callImageGen).mockResolvedValue({
      image: Buffer.from('green'),
      latency_ms: 100,
    })
    vi.mocked(createOrUpdateAsset).mockReset()
    vi.mocked(writeAssetBinary).mockReset()
    vi.mocked(patchAsset).mockReset()
    vi.mocked(setPipelineStatus).mockReset()
    vi.mocked(sliceAssets).mockReset()
    vi.mocked(sliceAssets).mockResolvedValue([
      { buffer: Buffer.from('s1'), opaque_pct: 50, bbox: [0, 0, 10, 10] },
      { buffer: Buffer.from('s2'), opaque_pct: 60, bbox: [20, 0, 10, 10] },
    ] as never)
  })

  it('groups static elements by visual_category and calls image_gen per group', async () => {
    vi.mocked(getElementsByPage).mockResolvedValue([
      {
        id: 'e1', visual_category: 'subject', type: 'static', bbox: [0, 0, 0.5, 0.5],
        name: 'hero', description: 'd', state_ids: ['st'], page_id: 'pg', z_index: 0,
        reviewed: true, created_at: '', updated_at: '',
      },
      {
        id: 'e2', visual_category: 'decoration', type: 'static', bbox: [0.6, 0, 0.1, 0.1],
        name: 'star', description: 'd', state_ids: ['st'], page_id: 'pg', z_index: 0,
        reviewed: true, created_at: '', updated_at: '',
      },
      {
        id: 'e3', visual_category: 'decoration', type: 'static', bbox: [0.7, 0.1, 0.1, 0.1],
        name: 'chip', description: 'd', state_ids: ['st'], page_id: 'pg', z_index: 0,
        reviewed: true, created_at: '', updated_at: '',
      },
      {
        id: 'e4', visual_category: 'container', type: 'code', bbox: [0, 0, 1, 1],
        name: 'box', description: 'd', state_ids: ['st'], page_id: 'pg', z_index: 0,
        reviewed: true, created_at: '', updated_at: '',
      },
    ] as never)

    await runPass2('st')
    // type=static + 2 个 visual_category(subject + decoration)= 2 路调用
    expect(callImageGen).toHaveBeenCalledTimes(2)

    // decoration 路有 2 个 element → reference_image_base64s 长度 2(主图在 reference_image_base64)
    const decorationCall = vi.mocked(callImageGen).mock.calls.find(([, opts]) =>
      typeof opts.prompt === 'string' && opts.prompt.includes('装饰'),
    )
    expect(decorationCall).toBeDefined()
    expect(decorationCall![1].reference_image_base64).toBeDefined()
    expect(decorationCall![1].reference_image_base64s).toHaveLength(2)

    // subject 路 1 个 element → refs 长度 1
    const subjectCall = vi.mocked(callImageGen).mock.calls.find(([, opts]) =>
      typeof opts.prompt === 'string' && opts.prompt.includes('主体'),
    )
    expect(subjectCall).toBeDefined()
    expect(subjectCall![1].reference_image_base64s).toHaveLength(1)
  })

  it('main image is at index 0 of image_urls (reference_image_base64), crops follow in order', async () => {
    vi.mocked(getElementsByPage).mockResolvedValue([
      {
        id: 'e1', visual_category: 'decoration', type: 'static', bbox: [0.1, 0, 0.1, 0.1],
        name: 'a', description: 'da', state_ids: ['st'], page_id: 'pg', z_index: 0,
        reviewed: true, created_at: '', updated_at: '',
      },
      {
        id: 'e2', visual_category: 'decoration', type: 'static', bbox: [0.5, 0, 0.1, 0.1],
        name: 'b', description: 'db', state_ids: ['st'], page_id: 'pg', z_index: 0,
        reviewed: true, created_at: '', updated_at: '',
      },
    ] as never)

    await runPass2('st')
    expect(callImageGen).toHaveBeenCalledTimes(1)
    const opts = vi.mocked(callImageGen).mock.calls[0]![1]
    expect(opts.reference_image_base64).toMatch(/^data:image\/png;base64,/)
    expect(opts.reference_image_base64s).toHaveLength(2)
    // crops 顺序与 elements 数组一致(e1 的 crop 在前,e2 的 crop 在后)
    // crop mock 把 bbox.join(',') 编进 buffer,base64 解码后能看到原 bbox 字符串
    const decode = (dataUrl: string) =>
      Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64').toString()
    expect(decode(opts.reference_image_base64s![0]!)).toContain('0.1,0,0.1,0.1')
    expect(decode(opts.reference_image_base64s![1]!)).toContain('0.5,0,0.1,0.1')
  })

  it('tolerates per-route failure: failed route marks elements failed, others proceed', async () => {
    vi.mocked(getElementsByPage).mockResolvedValue([
      {
        id: 'e1', visual_category: 'subject', type: 'static', bbox: [0, 0, 0.5, 0.5],
        name: 'h', description: 'd', state_ids: ['st'], page_id: 'pg', z_index: 0,
        reviewed: true, created_at: '', updated_at: '',
      },
      {
        id: 'e2', visual_category: 'decoration', type: 'static', bbox: [0.6, 0, 0.1, 0.1],
        name: 's', description: 'd', state_ids: ['st'], page_id: 'pg', z_index: 0,
        reviewed: true, created_at: '', updated_at: '',
      },
    ] as never)
    let i = 0
    vi.mocked(callImageGen).mockImplementation(async () => {
      i++
      if (i === 1) throw new Error('mock fail')
      return { image: Buffer.from('green'), latency_ms: 100 }
    })

    // 整体不抛(单路 catch-and-mark-failed)
    await expect(runPass2('st')).resolves.toBeDefined()

    // 至少 1 个 asset 标 failed(失败那路的 element)
    const failedCalls = vi
      .mocked(createOrUpdateAsset)
      .mock.calls.filter(([input]) => input.status === 'failed')
    expect(failedCalls.length).toBeGreaterThanOrEqual(1)
  })

  it('does not cross-assign slices between categories (slice merge constraint)', async () => {
    vi.mocked(getElementsByPage).mockResolvedValue([
      {
        id: 'e1', visual_category: 'subject', type: 'static', bbox: [0, 0, 0.5, 0.5],
        name: 'h', description: 'd', state_ids: ['st'], page_id: 'pg', z_index: 0,
        reviewed: true, created_at: '', updated_at: '',
      },
      {
        id: 'e2', visual_category: 'decoration', type: 'static', bbox: [0.6, 0, 0.1, 0.1],
        name: 's', description: 'd', state_ids: ['st'], page_id: 'pg', z_index: 0,
        reviewed: true, created_at: '', updated_at: '',
      },
    ] as never)
    // sliceAssets 在每次调用都返回 2 个切片(模拟模型多画了 1 个)
    vi.mocked(sliceAssets).mockResolvedValue([
      { buffer: Buffer.from('s1'), opaque_pct: 50, bbox: [0, 0, 10, 10] },
      { buffer: Buffer.from('s2'), opaque_pct: 60, bbox: [20, 0, 10, 10] },
    ] as never)

    await runPass2('st')
    // 即使每路返回 2 切片,subject 路只该匹配 e1(1 个 element);decoration 路只匹配 e2
    // writeAssetBinary 应该只被调 2 次(不是 4 次)
    expect(writeAssetBinary).toHaveBeenCalledTimes(2)
    const calledIds = vi.mocked(writeAssetBinary).mock.calls.map((c) => c[0]).sort()
    expect(calledIds).toEqual(['e1', 'e2'])
  })

  it('skips type=code elements entirely', async () => {
    vi.mocked(getElementsByPage).mockResolvedValue([
      {
        id: 'e_code', visual_category: 'container', type: 'code', bbox: [0, 0, 1, 1],
        name: 'box', description: 'd', state_ids: ['st'], page_id: 'pg', z_index: 0,
        reviewed: true, created_at: '', updated_at: '',
      },
    ] as never)
    // 全 code → 没 static 元素 → 抛错
    await expect(runPass2('st')).rejects.toThrow(/没有 type=static/)
    expect(callImageGen).not.toHaveBeenCalled()
  })
})
