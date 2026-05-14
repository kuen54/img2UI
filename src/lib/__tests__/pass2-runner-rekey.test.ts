// Phase 8g · reKeyViaApi:用户手动 API 抠图 fallback
// 覆盖:happy path / 部分失败容忍 / 全失败抛错 / 缺 provider / 缺 pass2 raw
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/matting-client', () => ({ callMatting: vi.fn() }))
vi.mock('@/lib/states', () => ({
  getState: vi.fn(),
  setPipelineStatus: vi.fn(),
}))
vi.mock('@/lib/pages', () => ({ getPage: vi.fn() }))
vi.mock('@/lib/projects', () => ({ getProject: vi.fn() }))
vi.mock('@/lib/elements', () => ({ getElementsByPage: vi.fn() }))
vi.mock('@/lib/pipelines', () => ({
  createRun: vi.fn().mockResolvedValue({ id: 'run_rekey' }),
  completeRun: vi.fn(),
  failRun: vi.fn(),
}))
vi.mock('@/lib/config', () => ({
  loadConfig: vi.fn(),
}))
vi.mock('@/lib/multi-png-stack', () => ({
  listMultiRouteFiles: vi.fn(),
}))
vi.mock('@/lib/slicer', () => ({
  sliceAssets: vi.fn(),
}))
vi.mock('@/lib/assets', () => ({
  createOrUpdateAsset: vi.fn(),
  writeAssetBinary: vi.fn(),
  patchAsset: vi.fn(),
}))
vi.mock('node:fs', async () => {
  const real = await vi.importActual<typeof import('node:fs')>('node:fs')
  return {
    ...real,
    promises: {
      ...real.promises,
      readFile: vi.fn().mockResolvedValue(Buffer.from('greenpng')),
      writeFile: vi.fn(),
      mkdir: vi.fn(),
    },
  }
})
vi.mock('sharp', () => {
  const m = vi.fn().mockReturnValue({
    metadata: vi.fn().mockResolvedValue({ width: 50, height: 50 }),
  })
  return { default: m }
})

import { reKeyViaApi } from '@/lib/pass2-runner'
import { callMatting } from '@/lib/matting-client'
import { getState } from '@/lib/states'
import { getElementsByPage } from '@/lib/elements'
import { loadConfig } from '@/lib/config'
import { listMultiRouteFiles } from '@/lib/multi-png-stack'
import { sliceAssets } from '@/lib/slicer'
import { createOrUpdateAsset, writeAssetBinary } from '@/lib/assets'
import { promises as fsp } from 'node:fs'
import { completeRun, failRun } from '@/lib/pipelines'

const provider = {
  id: 'p_kk',
  kind: 'matting' as const,
  active: true,
  name: 'koukoutu',
  api_format: 'koukoutu' as const,
  api_key: 'k',
  base_url: 'https://sync.koukoutu.com/v1',
  model: 'background-removal',
  created_at: '',
  updated_at: '',
}

describe('reKeyViaApi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getState).mockResolvedValue({
      id: 'st_x',
      page_id: 'pg',
      name: 'canon',
      original_image_path: '/x',
      width: 100,
      height: 100,
      pipeline_status: 'pass2_done',
      created_at: '',
    } as never)
    vi.mocked(loadConfig).mockResolvedValue({
      providers: [provider],
      prompts: {},
      settings: {},
      version: '0.1.0',
    } as never)
    vi.mocked(getElementsByPage).mockResolvedValue([
      {
        id: 'e_subject1', visual_category: 'subject', type: 'static',
        bbox: [0, 0, 0.5, 0.5], name: 'hero', description: 'd',
        state_ids: ['st_x'], page_id: 'pg', z_index: 0,
        reviewed: true, created_at: '', updated_at: '',
      },
      {
        id: 'e_button1', visual_category: 'button', type: 'static',
        bbox: [0.6, 0, 0.1, 0.1], name: 'cta', description: 'd',
        state_ids: ['st_x'], page_id: 'pg', z_index: 0,
        reviewed: true, created_at: '', updated_at: '',
      },
    ] as never)
    vi.mocked(callMatting).mockResolvedValue(Buffer.from('transparent'))
    vi.mocked(sliceAssets).mockResolvedValue([
      { buffer: Buffer.from('s1'), opaque_pct: 70, bbox: [0, 0, 50, 50] },
    ] as never)
  })

  it('happy path:每路 pass2 raw → callMatting → 写 keyed → 切片 → 更新 asset', async () => {
    vi.mocked(listMultiRouteFiles).mockResolvedValue([
      '/data/pass2/st_x-subject.png',
      '/data/pass2/st_x-button.png',
    ])

    const result = await reKeyViaApi('st_x')

    expect(callMatting).toHaveBeenCalledTimes(2)
    expect(sliceAssets).toHaveBeenCalledTimes(2)
    // 写 keyed 2 次(subject + button)
    expect(fsp.writeFile).toHaveBeenCalledWith(
      expect.stringMatching(/keyed\/st_x-subject\.png$/),
      expect.any(Buffer),
    )
    expect(fsp.writeFile).toHaveBeenCalledWith(
      expect.stringMatching(/keyed\/st_x-button\.png$/),
      expect.any(Buffer),
    )
    // 每路各 1 个 element 1 个 slice → 各 1 次 asset 写
    expect(writeAssetBinary).toHaveBeenCalledTimes(2)
    expect(createOrUpdateAsset).toHaveBeenCalledTimes(2)
    expect(result.refreshed).toBe(2)
    expect(result.failed_routes).toEqual([])
    expect(completeRun).toHaveBeenCalledTimes(1)
  })

  it('部分失败:某路 callMatting 抛错 → 该路 asset 不动,其他路正常完成', async () => {
    vi.mocked(listMultiRouteFiles).mockResolvedValue([
      '/data/pass2/st_x-subject.png',
      '/data/pass2/st_x-button.png',
    ])
    vi.mocked(callMatting)
      .mockResolvedValueOnce(Buffer.from('ok'))
      .mockRejectedValueOnce(new Error('koukoutu HTTP 500'))

    const result = await reKeyViaApi('st_x')

    expect(result.refreshed).toBe(1)
    expect(result.failed_routes).toEqual([
      { category: 'button', error: 'koukoutu HTTP 500' },
    ])
    // 失败路:不写 keyed/button.png(transparent 没生成)
    const writeCalls = vi.mocked(fsp.writeFile).mock.calls.map((c) => c[0])
    expect(writeCalls).toContainEqual(expect.stringMatching(/subject/))
    expect(writeCalls).not.toContainEqual(expect.stringMatching(/button/))
    expect(completeRun).toHaveBeenCalledTimes(1)
  })

  it('全失败:所有路都抛 → 整个 run failed', async () => {
    vi.mocked(listMultiRouteFiles).mockResolvedValue([
      '/data/pass2/st_x-subject.png',
    ])
    vi.mocked(callMatting).mockRejectedValue(new Error('boom'))

    await expect(reKeyViaApi('st_x')).rejects.toThrow(/全部失败/)
    expect(failRun).toHaveBeenCalledTimes(1)
    expect(completeRun).not.toHaveBeenCalled()
  })

  it('没有 active matting provider → 抛', async () => {
    vi.mocked(loadConfig).mockResolvedValue({
      providers: [],
      prompts: {},
      settings: {},
      version: '0.1.0',
    } as never)

    await expect(reKeyViaApi('st_x')).rejects.toThrow(/未配置 active matting provider/)
    expect(callMatting).not.toHaveBeenCalled()
  })

  it('没有 pass2 raw → 抛', async () => {
    vi.mocked(listMultiRouteFiles).mockResolvedValue([])

    await expect(reKeyViaApi('st_x')).rejects.toThrow(/pass2 raw 不存在/)
    expect(callMatting).not.toHaveBeenCalled()
  })

  it('state not found → 抛', async () => {
    vi.mocked(getState).mockResolvedValue(null)

    await expect(reKeyViaApi('st_x')).rejects.toThrow(/state not found/)
  })

  it('slices < elements:只用前 N 个 slice 指派,模型多画的不污染', async () => {
    vi.mocked(getElementsByPage).mockResolvedValue([
      {
        id: 'e1', visual_category: 'subject', type: 'static',
        bbox: [0, 0, 0.5, 0.5], name: 'a', description: '',
        state_ids: ['st_x'], page_id: 'pg', z_index: 0,
        reviewed: true, created_at: '', updated_at: '',
      },
      {
        id: 'e2', visual_category: 'subject', type: 'static',
        bbox: [0.5, 0, 0.5, 0.5], name: 'b', description: '',
        state_ids: ['st_x'], page_id: 'pg', z_index: 0,
        reviewed: true, created_at: '', updated_at: '',
      },
    ] as never)
    vi.mocked(listMultiRouteFiles).mockResolvedValue(['/data/pass2/st_x-subject.png'])
    // 只切出 1 个 slice,但有 2 个 element
    vi.mocked(sliceAssets).mockResolvedValue([
      { buffer: Buffer.from('only'), opaque_pct: 80, bbox: [0, 0, 50, 50] },
    ] as never)

    const result = await reKeyViaApi('st_x')
    expect(result.refreshed).toBe(1)
    expect(writeAssetBinary).toHaveBeenCalledTimes(1)
  })
})
