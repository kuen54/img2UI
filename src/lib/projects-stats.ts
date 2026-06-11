// 项目级聚合 stats:供 GET /api/projects 列表行用
//
// 成本说明:本函数对每个项目独立扫一遍 data/pipelines + data/assets。
// MVP 规模(< 20 项目 / < 200 pipeline runs)实测可接受;Promise.all 并行 +
// OS file cache 去重让多项目的 wall time 接近单项目。规模上来再批处理。
//
// TTL 缓存:5 秒,用来吃掉 Home / ProjectDetail 同帧多次拉的 burst,以及避免
// 短时间内重复扫 data/{pipelines,assets} 的成本。dev hot-reload 模块重载会
// 自动清空,prod 长进程下定期 ttl 失效。

import path from 'node:path'
import {
  DATA_ROOT,
  readJsonLenient,
  readdirIfExists,
  ensureDataRoot,
} from './fs-utils'
import { listPagesByProject, listStatesByPage } from './projects'
import { getElementsForPage } from './elements'
import type { Asset, PipelinePassKind, PipelineRun } from './types'

export interface ProjectStats {
  total_pages: number
  total_states: number
  total_elements: number
  total_assets: number
  uploaded_assets: number
  /** 该项目下任一 state 的最近一次 PipelineRun(按 completed_at, fallback started_at 排序) */
  last_run?: {
    at: string
    pass: PipelinePassKind
    status: 'running' | 'completed' | 'failed'
  }
  /** 按 state.pipeline_status 分桶,辅助 ProjectDetail 后续做进度条 */
  pipeline_coverage: {
    idle: number
    pass1_done: number
    pass2_done: number
    validated: number
    /** running / failed / validating 等中间态合并 */
    other: number
  }
}

const CACHE = new Map<string, { data: ProjectStats; expiresAt: number }>()
const TTL_MS = 5_000

export async function getProjectStats(projectId: string): Promise<ProjectStats> {
  const now = Date.now()
  const hit = CACHE.get(projectId)
  if (hit && hit.expiresAt > now) return hit.data
  const data = await computeProjectStats(projectId)
  CACHE.set(projectId, { data, expiresAt: now + TTL_MS })
  return data
}

async function computeProjectStats(projectId: string): Promise<ProjectStats> {
  await ensureDataRoot()

  const pages = await listPagesByProject(projectId)
  const total_pages = pages.length
  const pageIds = new Set(pages.map((p) => p.id))

  const allStatesNested = await Promise.all(pages.map((p) => listStatesByPage(p.id)))
  const allStates = allStatesNested.flat()
  const total_states = allStates.length
  const stateIds = new Set(allStates.map((s) => s.id))

  // 元素:每 page 的 elements 文件读一次
  const elementCounts = await Promise.all(
    pages.map((p) => getElementsForPage(p.id).then((es) => es.length)),
  )
  const total_elements = elementCounts.reduce((a, b) => a + b, 0)

  // 资产 + PipelineRun:各扫一次目录,在内存里按 page_id / state_id 过滤
  const [projectAssets, projectRuns] = await Promise.all([
    scanAssetsForPages(pageIds),
    scanRunsForStates(stateIds),
  ])

  const total_assets = projectAssets.length
  const uploaded_assets = projectAssets.filter((a) => a.status === 'uploaded').length

  const lastRun = projectRuns[0]
  const last_run = lastRun
    ? {
        at: lastRun.completed_at ?? lastRun.started_at,
        pass: lastRun.pass,
        status: lastRun.status,
      }
    : undefined

  const pipeline_coverage = { idle: 0, pass1_done: 0, pass2_done: 0, validated: 0, other: 0 }
  for (const s of allStates) {
    switch (s.pipeline_status) {
      case 'idle':
        pipeline_coverage.idle++
        break
      case 'pass1_done':
        pipeline_coverage.pass1_done++
        break
      case 'pass2_done':
        pipeline_coverage.pass2_done++
        break
      case 'validated':
        pipeline_coverage.validated++
        break
      default:
        pipeline_coverage.other++
    }
  }

  return {
    total_pages,
    total_states,
    total_elements,
    total_assets,
    uploaded_assets,
    ...(last_run ? { last_run } : {}),
    pipeline_coverage,
  }
}

async function scanAssetsForPages(pageIds: Set<string>): Promise<Asset[]> {
  if (pageIds.size === 0) return []
  const dir = path.join(DATA_ROOT, 'assets')
  const files = await readdirIfExists(dir)
  const all = await Promise.all(
    files
      .filter((f) => f.endsWith('.json'))
      .map((f) => readJsonLenient<Asset>(path.join(dir, f))),
  )
  return all.filter((a): a is Asset => a !== null && pageIds.has(a.page_id))
}

async function scanRunsForStates(stateIds: Set<string>): Promise<PipelineRun[]> {
  if (stateIds.size === 0) return []
  const dir = path.join(DATA_ROOT, 'pipelines')
  const files = await readdirIfExists(dir)
  const all = await Promise.all(
    files
      .filter((f) => f.endsWith('.json'))
      .map((f) => readJsonLenient<PipelineRun>(path.join(dir, f))),
  )
  return all
    .filter((r): r is PipelineRun => r !== null && stateIds.has(r.state_id))
    .sort((a, b) =>
      (b.completed_at ?? b.started_at).localeCompare(a.completed_at ?? a.started_at),
    )
}
