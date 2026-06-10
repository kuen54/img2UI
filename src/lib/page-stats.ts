// 页面级聚合 stats:供 GET /api/projects/[id]/pages 列表行用
//
// 成本说明:每个 page 调一次,内部走 listAssetsForPage(扫一遍 data/assets)
// + listPipelineRunsByState 每 state 一次(扫一遍 data/pipelines)。MVP 单
// 项目 < 10 页 + 单 page 1-2 state 实测可接受(Promise.all 并行 + OS file cache)。
//
// TTL 缓存:5 秒,跟 projects-stats 一致,吃掉 burst 调用 + 重复扫描成本。

import { getState, listStatesByPage } from './projects'
import { getElementsForPage, listPipelineRunsByState } from './elements'
import { listAssetsForPage } from './assets'
import type {
  PipelinePassKind,
  PipelineRun,
  StatePipelineStatus,
} from './types'

export interface PageStats {
  state_count: number
  /** canonical state 的 pipeline_status;null = 还没上传任何 state */
  pipeline_status: StatePipelineStatus | null
  total_elements: number
  /** 已人工确认(reviewed)的元素数 */
  reviewed_elements: number
  /** type=static 元素数(指派进度的分母;Asset 只在指派时产生,total_assets 即已指派数) */
  static_elements: number
  total_assets: number
  uploaded_assets: number
  /** 该页面所有 state 下最近一次 PipelineRun(按 completed_at, fallback started_at) */
  last_run?: {
    at: string
    pass: PipelinePassKind
    status: 'running' | 'completed' | 'failed'
  }
}

const CACHE = new Map<string, { data: PageStats; expiresAt: number }>()
const TTL_MS = 5_000

export async function getPageStats(
  pageId: string,
  canonicalStateId: string | null,
): Promise<PageStats> {
  const key = `${pageId}:${canonicalStateId ?? 'null'}`
  const now = Date.now()
  const hit = CACHE.get(key)
  if (hit && hit.expiresAt > now) return hit.data
  const data = await computePageStats(pageId, canonicalStateId)
  CACHE.set(key, { data, expiresAt: now + TTL_MS })
  return data
}

async function computePageStats(
  pageId: string,
  canonicalStateId: string | null,
): Promise<PageStats> {
  const [states, elements, assets, canonicalState] = await Promise.all([
    listStatesByPage(pageId),
    getElementsForPage(pageId),
    listAssetsForPage(pageId),
    canonicalStateId ? getState(canonicalStateId) : Promise.resolve(null),
  ])

  // 拉所有 state 的 pipeline runs,扁平化后按时间排
  const runsNested = await Promise.all(
    states.map((s) => listPipelineRunsByState(s.id)),
  )
  const allRuns = runsNested.flat().sort((a: PipelineRun, b: PipelineRun) =>
    (b.completed_at ?? b.started_at).localeCompare(
      a.completed_at ?? a.started_at,
    ),
  )
  const latestRun = allRuns[0]

  const last_run = latestRun
    ? {
        at: latestRun.completed_at ?? latestRun.started_at,
        pass: latestRun.pass,
        status: latestRun.status,
      }
    : undefined

  return {
    state_count: states.length,
    pipeline_status: canonicalState?.pipeline_status ?? null,
    total_elements: elements.length,
    reviewed_elements: elements.filter((e) => e.reviewed).length,
    static_elements: elements.filter((e) => e.type === 'static').length,
    total_assets: assets.length,
    uploaded_assets: assets.filter((a) => a.status === 'uploaded').length,
    ...(last_run ? { last_run } : {}),
  }
}
