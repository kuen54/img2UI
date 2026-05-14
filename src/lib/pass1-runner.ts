// Pass 1 主编排:读图 + 渲染 prompt + 调 mllm + 解析 + 合并 elements + 写盘
// Phase 4 实现,替换 Phase 3 mock

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
import { newElementId } from '@/lib/id'

// LLM 输出 schema(SPEC § Pass 1 prompt 模板)
type LlmElementOut = {
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
      throw new Error('该状态正在跑 pipeline,稍候再试')
    }
    throw e
  }

  let runId: string | null = null
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

    // 创建 PipelineRun + 标 running
    const run = await createRun({
      state_id: stateId,
      pass: 'pass1',
      llm_request: {
        provider_id: provider.id,
        model: provider.model ?? '',
        prompt: '[Pass 1 system + user; 完整内容写在 parsed_result]',
        images: [state.original_image_path],
        extra: {},
      },
    })
    runId = run.id
    await setPipelineStatus(stateId, 'pass1_running', { pass1_run_id: run.id })

    // 渲染 user message:含 page metadata + canonical first 的所有 state(含图)
    const allStates = await listStatesByPage(state.page_id)
    const userMessage = await renderPass1UserMessage(project, page, allStates)
    const messages: MllmMessage[] = [
      { role: 'system', content: config.prompts.pass1_layout },
      { role: 'user', content: userMessage },
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
      // gemini thinking budget(SPEC.md § Pass 1 Provider 设置)
      callOpts.extra_body = {
        google: {
          thinking_config: { include_thoughts: false, thinking_budget: 4096 },
        },
      }
    }

    const { content } = await callMllm(provider, callOpts)

    // 解析 JSON(strip markdown code fence 兜底)
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

    // 合并已有 Elements(cross-state by entity_name)
    const merged = await mergeWithExisting(state, parsed.elements)
    await saveElementsForPage(state.page_id, merged)

    // 收尾
    await setPipelineStatus(stateId, 'pass1_done')
    await completeRun(run.id, {
      llm_response: { content_length: content.length },
      parsed_result: { element_count: merged.length, raw_count: parsed.elements.length },
    })
    return { run_id: run.id }
  } catch (err) {
    if (runId) {
      await failRun(runId, {
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
// helpers
// =============================================================================

async function renderPass1UserMessage(
  project: { name: string; description?: string; tech_stack_hint?: string },
  page: Page,
  states: State[],
): Promise<Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }>> {
  // canonical 状态先排
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
  parts.push({ type: 'text', text: '\nBe EXHAUSTIVE. Identify every distinct element separately. Return JSON.' })
  return parts
}

async function readPngAsDataUrl(stateId: string): Promise<string> {
  const filepath = path.join(DATA_ROOT, 'raw', `${stateId}.png`)
  const buf = await fs.readFile(filepath)
  return `data:image/png;base64,${buf.toString('base64')}`
}

function stripMarkdownJsonFence(content: string): string {
  const trimmed = content.trim()
  // ```json\n...\n```  或  ```\n...\n```
  const m = trimmed.match(/^```(?:json)?\s*\n([\s\S]*?)\n```$/)
  if (m && m[1]) return m[1].trim()
  return trimmed
}

async function mergeWithExisting(state: State, llmElements: LlmElementOut[]): Promise<Element[]> {
  const existing = await getElementsByPage(state.page_id)
  const now = new Date().toISOString()

  // index existing by name(忽略大小写空格)
  const indexedExisting = new Map<string, Element>()
  for (const e of existing) indexedExisting.set(normalizeName(e.name), e)

  const merged: Element[] = [...existing]
  const seenIds = new Set<string>()

  for (const llm of llmElements) {
    const name = llm.entity_name || `unnamed_${newElementId()}`
    const key = normalizeName(name)

    // clamp bbox 到 [0, 1]
    const bbox: [number, number, number, number] = [
      clamp01(llm.bbox?.[0] ?? 0),
      clamp01(llm.bbox?.[1] ?? 0),
      clamp01(llm.bbox?.[2] ?? 0),
      clamp01(llm.bbox?.[3] ?? 0),
    ]

    const found = indexedExisting.get(key)
    if (found) {
      // cross-state 合并:加进 state_ids 不重复,其他字段不覆盖(用户可能已编辑)
      seenIds.add(found.id)
      const idx = merged.findIndex((e) => e.id === found.id)
      if (idx >= 0) {
        const cur = merged[idx]!
        if (!cur.state_ids.includes(state.id)) {
          merged[idx] = {
            ...cur,
            state_ids: [...cur.state_ids, state.id],
            updated_at: now,
          }
        }
      }
    } else {
      // 新增
      const id = newElementId()
      seenIds.add(id)
      merged.push({
        id,
        page_id: state.page_id,
        state_ids: [state.id],
        name,
        type: llm.type === 'code' ? 'code' : 'static',
        bbox,
        z_index: typeof llm.z_index === 'number' ? llm.z_index : 0,
        description: llm.description ?? '',
        ...(llm.type === 'code' && llm.shape_spec ? { shape_spec: llm.shape_spec } : {}),
        ...(llm.type === 'code' && llm.material_spec ? { material_spec: llm.material_spec } : {}),
        ...(llm.cross_state_notes ? { cross_state_notes: llm.cross_state_notes } : {}),
        reviewed: false,
        created_at: now,
        updated_at: now,
      })
    }
  }

  return merged
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, '_')
}

function clamp01(v: number): number {
  if (Number.isNaN(v)) return 0
  if (v < 0) return 0
  if (v > 1) return 1
  return v
}
