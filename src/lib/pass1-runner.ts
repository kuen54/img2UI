// HANDOFF §5 Pass 1 multi-route 实现
// 5 路并行(subject/button/container/background/decoration)调用 mllm,
// IoU 合并去重,< 3/5 路成功抛 PASS1_ERROR。

import { promises as fs } from 'node:fs'
import type {
  LayoutElement,
  StateRecord,
  VisualCategory,
  ProviderConfig,
  PipelineRun,
  PipelinePassKind,
} from './types'
import { newId, nowIso } from './id'
import { callMllm, type MllmMessage } from './llm-client'
import { paths } from './fs-utils'
import { saveElementsForPage, createPipelineRun, updatePipelineRun } from './elements'
import { deleteAssetsNotIn } from './assets'
import { getActiveProvider, getConfig } from './config'
import { clampBbox01, bboxArea } from './bbox-iou'
import { mergeRoutes, type RouteResult } from './pass1-route-merger'
import { PASS1_ROUTES } from './visual-category'
import {
  renderPass1RoutePrompt,
  renderPass1UserHeader,
  PASS1_USER_TAIL,
} from './prompts/render-pass1-route'

const TINY_ELEMENT_AREA_THRESHOLD = 0.001 // MVP S2

interface RawLlmElement {
  entity_name?: string
  type?: 'static' | 'code'
  type_reasoning?: string
  bbox?: number[]
  z_index?: number
  description?: string
  shape_spec?: string
  material_spec?: string
  cross_state_notes?: string
}
interface RawLlmResponse {
  elements?: RawLlmElement[]
}

export interface Pass1RouteSubResult {
  category: VisualCategory
  elements: LayoutElement[]
  filteredTiny: LayoutElement[]
  rawCount: number
  rawResponse: { content: string; usage: Record<string, unknown> }
  subRunId: string
}

export interface Pass1RouteSubFailure {
  category: VisualCategory
  error: string
  subRunId: string
}

export interface Pass1MultiResult {
  successes: Pass1RouteSubResult[]
  failures: Pass1RouteSubFailure[]
  /** 最终合并后的 elements(已写到 data/elements/{page}.json) */
  mergedElements: LayoutElement[]
  /** 全部小元素过滤产物(各路次合并) */
  filteredTiny: LayoutElement[]
}

/**
 * Pass 1 — 5 路并行 + IoU 合并(Phase 4)。
 *
 * 退出条件:
 * - ≥ 3/5 路成功 → 走合并 + 写 elements + 返回 Pass1MultiResult
 * - < 3/5 路成功 → 抛 PASS1_ERROR
 *
 * 不管总 audit run 的生命周期,API 层管。
 */
export async function runPass1MultiRoute(input: {
  state: StateRecord
  pageName: string
  pageDescription?: string
}): Promise<Pass1MultiResult> {
  const { state } = input

  const provider = await getActiveProvider('mllm')
  if (!provider) {
    throw new Error('未配置 active mllm provider,请先到 Settings/Providers 填 API key')
  }

  const config = await getConfig()
  const basePrompt = config.prompts.pass1_layout

  const imageBuf = await fs.readFile(paths.raw(state.id))
  const imageDataUrl = `data:image/png;base64,${imageBuf.toString('base64')}`

  const userHeader = renderPass1UserHeader({
    pageName: input.pageName,
    ...(input.pageDescription !== undefined ? { pageDescription: input.pageDescription } : {}),
    stateCount: 1,
  })

  // 5 路并行
  const settled = await Promise.allSettled(
    PASS1_ROUTES.map((category) =>
      runRoute({
        category,
        provider,
        basePrompt,
        imageDataUrl,
        userHeader,
        state,
      }),
    ),
  )

  const successes: Pass1RouteSubResult[] = []
  const failures: Pass1RouteSubFailure[] = []
  for (let i = 0; i < settled.length; i++) {
    const category = PASS1_ROUTES[i]!
    const r = settled[i]!
    if (r.status === 'fulfilled') {
      successes.push(r.value)
    } else {
      failures.push({
        category,
        error: r.reason instanceof Error ? r.reason.message : String(r.reason),
        subRunId: '', // sub-run 创建早于失败,但拿不到 id;前端不依赖
      })
    }
  }

  if (successes.length < 3) {
    const reason = `仅 ${successes.length}/5 路成功 (< 3 阈值)。failures: ${failures
      .map((f) => `${f.category}=${f.error.slice(0, 80)}`)
      .join('; ')}`
    throw new Error(reason)
  }

  const merged = mergeRoutes(
    successes.map<RouteResult>((s) => ({ category: s.category, elements: s.elements })),
  )
  const allFilteredTiny = successes.flatMap((s) => s.filteredTiny)

  // 写到 page elements(整批替换)
  await saveElementsForPage(state.page_id, merged)
  // 整批替换后旧 element id 全部失效 → 清理失去引用的 Asset + assets-bin,
  // 避免孤儿 asset 留在 listAssetsForPage 里污染 export manifest
  await deleteAssetsNotIn(state.page_id, new Set(merged.map((e) => e.id)))

  return {
    successes,
    failures,
    mergedElements: merged,
    filteredTiny: allFilteredTiny,
  }
}

// ─── 单路 sub-run ──────────────────────────────────────────────────────────

async function runRoute(input: {
  category: VisualCategory
  provider: ProviderConfig
  basePrompt: string
  imageDataUrl: string
  userHeader: string
  state: StateRecord
}): Promise<Pass1RouteSubResult> {
  const { category, provider, basePrompt, imageDataUrl, userHeader, state } = input

  const systemPrompt = renderPass1RoutePrompt(category, basePrompt)
  const messages: MllmMessage[] = [
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content: [
        { type: 'text', text: userHeader },
        { type: 'text', text: '1. canonical:' },
        { type: 'image_url', image_url: { url: imageDataUrl } },
        { type: 'text', text: PASS1_USER_TAIL },
      ],
    },
  ]

  // 创建 sub-run(running)
  const subRun: PipelineRun = {
    id: newId(),
    state_id: state.id,
    pass: `pass1_${category}` as PipelinePassKind,
    status: 'running',
    started_at: nowIso(),
    llm_request: {
      provider_id: provider.id,
      model: provider.model ?? '',
      prompt: systemPrompt,
      images: [paths.raw(state.id)],
      extra: buildExtraBody(provider),
    },
    llm_response: null,
  }
  await createPipelineRun(subRun)

  try {
    const result = await callMllm(provider, {
      messages,
      max_tokens: provider.default_max_tokens ?? 32_000,
      temperature: provider.default_temperature ?? 1,
      response_format: { type: 'json_object' },
      extra_body: buildExtraBody(provider),
    })

    const rawText = stripMarkdownJsonFence(result.content)
    let parsed: RawLlmResponse
    try {
      parsed = JSON.parse(rawText) as RawLlmResponse
    } catch (err) {
      throw new Error(
        `parse JSON failed: ${err instanceof Error ? err.message : String(err)}; raw[0..400]: ${rawText.slice(0, 400)}`,
      )
    }

    const rawElements = parsed.elements ?? []
    const { kept, filteredTiny } = postProcessElements({
      raw: rawElements,
      stateId: state.id,
      pageId: state.page_id,
      defaultCategory: category,
      stateWidth: state.width,
      stateHeight: state.height,
    })

    await updatePipelineRun(subRun.id, {
      status: 'completed',
      completed_at: nowIso(),
      llm_response: result,
      parsed_result: {
        elements: kept,
        filtered_tiny: filteredTiny,
        raw_count: rawElements.length,
      },
    })

    return {
      category,
      elements: kept,
      filteredTiny,
      rawCount: rawElements.length,
      rawResponse: result,
      subRunId: subRun.id,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await updatePipelineRun(subRun.id, {
      status: 'failed',
      completed_at: nowIso(),
      error: { code: 'PASS1_ROUTE_ERROR', message, retryable: true },
    }).catch(() => {})
    throw err
  }
}

// ─── 后处理流水线 ──────────────────────────────────────────────────────────

interface PostProcessInput {
  raw: RawLlmElement[]
  stateId: string
  pageId: string
  defaultCategory: VisualCategory
  stateWidth: number
  stateHeight: number
}
interface PostProcessOutput {
  kept: LayoutElement[]
  filteredTiny: LayoutElement[]
}

function postProcessElements(input: PostProcessInput): PostProcessOutput {
  const now = nowIso()
  const kept: LayoutElement[] = []
  const filteredTiny: LayoutElement[] = []

  for (const r of input.raw) {
    if (!r.bbox || r.bbox.length !== 4) continue
    const bboxRaw = normalizeBbox(r.bbox, input.stateWidth, input.stateHeight)
    const bbox = clampBbox01(bboxRaw)
    if (bbox[2] <= 0 || bbox[3] <= 0) continue

    const el: LayoutElement = {
      id: newId(),
      page_id: input.pageId,
      state_ids: [input.stateId],
      name: (r.entity_name ?? '').toString().slice(0, 200) || '未命名',
      type: r.type === 'code' ? 'code' : 'static',
      visual_category: input.defaultCategory,
      bbox,
      z_index: typeof r.z_index === 'number' ? r.z_index : 0,
      description: (r.description ?? '').toString().slice(0, 400),
      ...(r.shape_spec !== undefined ? { shape_spec: String(r.shape_spec) } : {}),
      ...(r.material_spec !== undefined ? { material_spec: String(r.material_spec) } : {}),
      ...(r.cross_state_notes !== undefined
        ? { cross_state_notes: String(r.cross_state_notes) }
        : {}),
      pass1_routes_seen: [input.defaultCategory],
      reviewed: false,
      created_at: now,
      updated_at: now,
    }

    if (bboxArea(bbox) < TINY_ELEMENT_AREA_THRESHOLD) {
      filteredTiny.push(el)
    } else {
      kept.push(el)
    }
  }

  return { kept, filteredTiny }
}

function normalizeBbox(
  bbox: number[],
  stateWidth: number,
  stateHeight: number,
): readonly [number, number, number, number] {
  const [x = 0, y = 0, w = 0, h = 0] = bbox
  const isPixelCoord = [x, y, w, h].some((v) => v > 1.5)
  if (isPixelCoord && stateWidth > 0 && stateHeight > 0) {
    return [x / stateWidth, y / stateHeight, w / stateWidth, h / stateHeight] as const
  }
  return [x, y, w, h] as const
}

export function stripMarkdownJsonFence(text: string): string {
  const trimmed = text.trim()
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  if (fenced && fenced[1]) return fenced[1].trim()
  return trimmed
}

export function buildExtraBody(provider: ProviderConfig): Record<string, unknown> {
  if (provider.model?.startsWith('gemini-3')) {
    return {
      extra_body: {
        google: {
          thinking_config: { include_thoughts: false, thinking_budget: 4096 },
        },
      },
    }
  }
  return {}
}

// ─── 兼容 Phase 3 单路 API(API 层会调) ────────────────────────────────────

export interface Pass1RouteResult {
  elements: LayoutElement[]
  filteredTiny: LayoutElement[]
  rawResponse: { content: string; usage: Record<string, unknown> }
  rawCount: number
}

export async function runPass1SingleRoute(input: {
  state: StateRecord
  category: VisualCategory
  pageName: string
  pageDescription?: string
}): Promise<Pass1RouteResult> {
  const { state, category } = input

  const provider = await getActiveProvider('mllm')
  if (!provider) {
    throw new Error('未配置 active mllm provider')
  }

  const config = await getConfig()
  const basePrompt = config.prompts.pass1_layout

  const imageBuf = await fs.readFile(paths.raw(state.id))
  const imageDataUrl = `data:image/png;base64,${imageBuf.toString('base64')}`

  const userHeader = renderPass1UserHeader({
    pageName: input.pageName,
    ...(input.pageDescription !== undefined ? { pageDescription: input.pageDescription } : {}),
    stateCount: 1,
  })

  const sub = await runRoute({
    category,
    provider,
    basePrompt,
    imageDataUrl,
    userHeader,
    state,
  })

  await saveElementsForPage(state.page_id, sub.elements)

  return {
    elements: sub.elements,
    filteredTiny: sub.filteredTiny,
    rawResponse: sub.rawResponse,
    rawCount: sub.rawCount,
  }
}

export function buildPass1RunStub(input: {
  state: StateRecord
  category: VisualCategory
  provider: ProviderConfig
}): PipelineRun {
  return {
    id: newId(),
    state_id: input.state.id,
    pass: `pass1_${input.category}` as PipelinePassKind,
    status: 'running',
    started_at: nowIso(),
    llm_request: {
      provider_id: input.provider.id,
      model: input.provider.model ?? '',
      prompt: '(stub)',
      images: [paths.raw(input.state.id)],
      extra: buildExtraBody(input.provider),
    },
    llm_response: null,
  }
}
