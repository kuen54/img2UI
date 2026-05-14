// Pass 1 主编排:5 路并行 mllm + IoU 合并(Phase 8b)
// 之前是 1-shot,Phase 8b 改为 5 路 only-X(subject/button/container/background/decoration)
// 每路调一次 mllm,Promise.allSettled,>=3/5 成功才继续,合并按 IoU > 0.5 + 优先级

import { promises as fs } from 'node:fs'
import path from 'node:path'

import type { Element, Page, State } from '@/lib/types'
import { DATA_ROOT } from '@/lib/fs-utils'
import { loadConfig } from '@/lib/config'
import { callMllm } from '@/lib/llm-client'
import type { MllmMessage } from '@/lib/llm-client'
import { getState, setPipelineStatus } from '@/lib/states'
import { listStatesByPage } from '@/lib/states'
import { getPage } from '@/lib/pages'
import { getProject } from '@/lib/projects'
import { getElementsByPage, saveElementsForPage } from '@/lib/elements'
import { createRun, completeRun, failRun } from '@/lib/pipelines'
import { acquireLock, releaseLock, RunLockConflictError } from '@/lib/run-lock'
import { renderPass1RoutePrompt } from '@/lib/prompts/render-pass1-route'
import { mergeRoutes, type RouteElement, type RouteResult } from '@/lib/pass1-route-merger'
import { bboxIoU } from '@/lib/bbox-iou'

// 5 路 only-X 列表(other 不跑独立路:over-include 哲学下兜底由 IoU 合并自然消解)
// 这里限定到 5 个具体 category,排除 'other'(PipelinePassKind 也无 pass1_other)
type RouteCategory = 'subject' | 'button' | 'container' | 'background' | 'decoration'
const ROUTE_CATEGORIES: RouteCategory[] = [
  'subject',
  'button',
  'container',
  'background',
  'decoration',
]
const MIN_SUCCESS_ROUTES = 3
const IOU_EXISTING_DUP_THRESHOLD = 0.5

// LLM 单路输出 schema(SPEC § Pass 1 prompt 模板),保持兼容旧接口
export type LlmElementOut = {
  entity_name: string
  type: 'static' | 'code'
  type_reasoning?: string
  bbox: [number, number, number, number]
  z_index?: number
  description: string
  shape_spec?: string
  material_spec?: string
  cross_state_notes?: string
  appears_in_states?: string[]
}
type LlmPass1Out = { elements: LlmElementOut[] }

export type Pass1Result = { run_id: string }

export async function runPass1(stateId: string): Promise<Pass1Result> {
  const lockKey = `state:${stateId}`
  try {
    acquireLock(lockKey, `pass1-${Date.now()}`)
  } catch (e) {
    if (e instanceof RunLockConflictError) {
      throw new Error('该设计稿正在跑 pipeline,稍候再试')
    }
    throw e
  }

  let totalRunId: string | null = null
  try {
    const state = await getState(stateId)
    if (!state) throw new Error('state not found')
    const page = await getPage(state.page_id)
    if (!page) throw new Error('page not found')
    const project = await getProject(page.project_id)
    if (!project) throw new Error('project not found')

    const config = await loadConfig()
    const provider = config.providers.find((p) => p.kind === 'mllm' && p.active)
    if (!provider) throw new Error('未配置 active mllm provider(去 /settings/models 设置)')

    // 总 run 作 audit 入口,sub-runs 通过 parsed_result.successful_routes 关联
    const totalRun = await createRun({
      state_id: stateId,
      pass: 'pass1',
      llm_request: {
        provider_id: provider.id,
        model: provider.model ?? '',
        prompt: '[Pass 1 5-route parallel; sub-runs 见 pass1_*]',
        images: [state.original_image_path],
        extra: { route_categories: ROUTE_CATEGORIES },
      },
    })
    totalRunId = totalRun.id
    await setPipelineStatus(stateId, 'pass1_running', { pass1_run_id: totalRun.id })

    // 渲染 user message:含 page metadata + canonical first 的所有 state(含图)
    const allStates = await listStatesByPage(state.page_id)
    const userParts = await renderPass1UserMessage(project, page, allStates)

    // 5 路并行;每路独立 sub-run + parse + complete/fail
    const routePromises = ROUTE_CATEGORIES.map((cat) =>
      runSingleRoute(cat, provider, config.prompts.pass1_layout, userParts, state),
    )
    const settled = await Promise.allSettled(routePromises)
    const successes: RouteResult[] = settled
      .filter((s): s is PromiseFulfilledResult<RouteResult> => s.status === 'fulfilled')
      .map((s) => s.value)
    const failureMessages = settled
      .filter((s): s is PromiseRejectedResult => s.status === 'rejected')
      .map((s) => (s.reason as Error).message)

    if (successes.length < MIN_SUCCESS_ROUTES) {
      throw new Error(
        `Pass 1 多路失败: 仅 ${successes.length}/${ROUTE_CATEGORIES.length} 成功(需 ≥${MIN_SUCCESS_ROUTES})。` +
          `失败原因示例:${failureMessages.slice(0, 2).join(' | ') || '(无)'}`,
      )
    }

    // IoU 合并 + 与已有 elements(可能已 reviewed)合并写盘
    const mergedRaw = mergeRoutes(successes)
    const existing = await getElementsByPage(state.page_id)
    const finalElements = mergeWithExisting(state, existing, mergedRaw)
    await saveElementsForPage(state.page_id, finalElements)

    await setPipelineStatus(stateId, 'pass1_done')
    await completeRun(totalRunId, {
      llm_response: {
        successful_routes: successes.length,
        total_routes: ROUTE_CATEGORIES.length,
        failed_routes: failureMessages.length,
      },
      parsed_result: {
        element_count: finalElements.length,
        by_category: countByCategory(finalElements),
      },
    })
    return { run_id: totalRunId }
  } catch (err) {
    if (totalRunId) {
      await failRun(totalRunId, {
        code: 'PASS1_ERROR',
        message: (err as Error).message,
        retryable: true,
      })
    }
    await setPipelineStatus(stateId, 'pass1_failed')
    throw err
  } finally {
    releaseLock(lockKey)
  }
}

// =============================================================================
// 单路:渲染 only-X prompt + callMllm + parse + sub-run 记录
// =============================================================================

async function runSingleRoute(
  category: RouteCategory,
  provider: NonNullable<Awaited<ReturnType<typeof loadConfig>>['providers'][number]>,
  basePrompt: string,
  userParts: Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }>,
  state: State,
): Promise<RouteResult> {
  const sys = renderPass1RoutePrompt(category, basePrompt)
  const messages: MllmMessage[] = [
    { role: 'system', content: sys },
    { role: 'user', content: userParts },
  ]

  const callOpts: Parameters<typeof callMllm>[1] = {
    messages,
    max_tokens: provider.default_max_tokens ?? 12000,
    response_format: { type: 'json_object' },
  }
  if (provider.default_temperature !== undefined) {
    callOpts.temperature = provider.default_temperature
  }
  if (provider.api_format === 'sankuai') {
    callOpts.extra_body = {
      google: {
        thinking_config: { include_thoughts: false, thinking_budget: 4096 },
      },
    }
  }

  const subRun = await createRun({
    state_id: state.id,
    pass: `pass1_${category}` as const,
    llm_request: {
      provider_id: provider.id,
      model: provider.model ?? '',
      prompt: `[only-${category}]`,
      images: [state.original_image_path],
      extra: { category },
    },
  })

  try {
    const { content } = await callMllm(provider, callOpts)
    const stripped = stripMarkdownJsonFence(content)
    let parsed: LlmPass1Out
    try {
      parsed = JSON.parse(stripped) as LlmPass1Out
    } catch (parseErr) {
      throw new Error(
        `LLM 输出非 JSON:${(parseErr as Error).message}; 内容前 300 字:${content.slice(0, 300)}`,
      )
    }
    if (!parsed.elements || !Array.isArray(parsed.elements)) {
      throw new Error(`LLM 输出 elements 不是数组:${JSON.stringify(parsed).slice(0, 300)}`)
    }
    // 像素坐标兜底归一化(单路内一致性,不跨路;跨路合并时 IoU 在归一化坐标下做)
    const normalized = normalizeBboxes(parsed.elements, state)
    await completeRun(subRun.id, {
      llm_response: { content_length: content.length },
      parsed_result: { element_count: normalized.length, category },
    })
    return { category, elements: normalized }
  } catch (err) {
    await failRun(subRun.id, {
      code: `PASS1_ROUTE_${category.toUpperCase()}_ERROR`,
      message: (err as Error).message,
      retryable: true,
    })
    throw err
  }
}

// =============================================================================
// helpers
// =============================================================================

async function renderPass1UserMessage(
  project: { name: string; description?: string; tech_stack_hint?: string },
  page: Page,
  states: State[],
): Promise<Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }>> {
  const canonical = states.find((s) => s.id === page.canonical_state_id)
  const others = states.filter((s) => s.id !== page.canonical_state_id)
  const ordered = canonical ? [canonical, ...others] : states

  const headerText =
    `Page name: ${page.name}\n` +
    `Page description: ${project.description ?? page.route_hint ?? ''}\n` +
    `Tech stack hint: ${project.tech_stack_hint ?? ''}\n\n` +
    `States (${ordered.length} total, canonical first):\n`

  const parts: Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }> = [
    { type: 'text', text: headerText },
  ]
  for (let i = 0; i < ordered.length; i++) {
    const s = ordered[i]!
    const dataUrl = await readPngAsDataUrl(s.id)
    const isCanonical = s.id === page.canonical_state_id
    parts.push({ type: 'text', text: `${i + 1}. ${isCanonical ? 'canonical' : s.name}:` })
    parts.push({ type: 'image_url', image_url: { url: dataUrl } })
  }
  parts.push({ type: 'text', text: '\nBe EXHAUSTIVE per the OVER-INCLUDE PHILOSOPHY in the system prompt. Return JSON.' })
  return parts
}

async function readPngAsDataUrl(stateId: string): Promise<string> {
  const filepath = path.join(DATA_ROOT, 'raw', `${stateId}.png`)
  const buf = await fs.readFile(filepath)
  return `data:image/png;base64,${buf.toString('base64')}`
}

function stripMarkdownJsonFence(content: string): string {
  const trimmed = content.trim()
  const m = trimmed.match(/^```(?:json)?\s*\n([\s\S]*?)\n```$/)
  if (m && m[1]) return m[1].trim()
  return trimmed
}

// 单路像素坐标兜底归一化:LLM 偶尔无视 prompt 输出像素坐标
// 启发式:任一 bbox 任一分量 > 1.5 → 视为像素,整批按 state.{width,height} 除
function normalizeBboxes(els: LlmElementOut[], state: State): RouteElement[] {
  const isPixelCoords = els.some(
    (el) => Array.isArray(el.bbox) && el.bbox.some((v) => typeof v === 'number' && v > 1.5),
  )
  return els.map((el): RouteElement => {
    const raw: [number, number, number, number] = [
      el.bbox?.[0] ?? 0,
      el.bbox?.[1] ?? 0,
      el.bbox?.[2] ?? 0,
      el.bbox?.[3] ?? 0,
    ]
    const normalized = isPixelCoords
      ? ([
          raw[0] / state.width,
          raw[1] / state.height,
          raw[2] / state.width,
          raw[3] / state.height,
        ] as [number, number, number, number])
      : raw
    const bbox: [number, number, number, number] = [
      clamp01(normalized[0]),
      clamp01(normalized[1]),
      clamp01(normalized[2]),
      clamp01(normalized[3]),
    ]
    const out: RouteElement = {
      entity_name: el.entity_name || 'unnamed',
      type: el.type === 'code' ? 'code' : 'static',
      bbox,
      description: el.description ?? '',
    }
    if (typeof el.z_index === 'number') out.z_index = el.z_index
    if (el.type_reasoning) out.type_reasoning = el.type_reasoning
    if (el.shape_spec) out.shape_spec = el.shape_spec
    if (el.material_spec) out.material_spec = el.material_spec
    if (el.cross_state_notes) out.cross_state_notes = el.cross_state_notes
    if (el.appears_in_states) out.appears_in_states = el.appears_in_states
    return out
  })
}

// 把多路合并后的元素并入已有(用户可能已 reviewed):
// IoU > 0.5 视为同一物理元素 → 跨 state 累加 state_id,字段保留 existing(不覆盖用户编辑)
// 否则作为新元素 push
function mergeWithExisting(
  state: State,
  existing: Element[],
  mergedRaw: ReturnType<typeof mergeRoutes>,
): Element[] {
  const now = new Date().toISOString()
  const out: Element[] = [...existing]
  for (const m of mergedRaw) {
    const dupIdx = out.findIndex((e) => bboxIoU(e.bbox, m.bbox) > IOU_EXISTING_DUP_THRESHOLD)
    if (dupIdx >= 0) {
      const cur = out[dupIdx]!
      if (!cur.state_ids.includes(state.id)) {
        out[dupIdx] = {
          ...cur,
          state_ids: [...cur.state_ids, state.id],
          updated_at: now,
        }
      }
    } else {
      out.push({
        ...m,
        page_id: state.page_id,
        state_ids: [state.id],
        reviewed: false,
        created_at: now,
        updated_at: now,
      })
    }
  }
  return out
}

function countByCategory(els: Element[]): Record<string, number> {
  const r: Record<string, number> = {}
  for (const e of els) r[e.visual_category] = (r[e.visual_category] ?? 0) + 1
  return r
}

function clamp01(v: number): number {
  if (Number.isNaN(v)) return 0
  if (v < 0) return 0
  if (v > 1) return 1
  return v
}
