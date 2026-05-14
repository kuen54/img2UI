// Pass 2 主编排:渲染 prompt + 调 image_gen + 写绿幕原图 + chroma key + 切片 + 写 assets
//
// Phase 5 实现(1-shot 全量)
// Phase 8c 重写主路径:按 visual_category 分组并行 + multi-ref crops
//
// 部分失败容忍策略(Phase 8c):
// - 每个 visual_category 一路 image_gen 调用(各自 sub-run = pass2_subject / pass2_decoration / ...)
// - 单路失败:该路所有 elements 的 asset 标 status=failed,其他路不受影响
// - Pass 2 总 run 始终 completed(只要 runPass2 走完整个 try);失败的 element 在 Asset Review 提示用户重抠
// - 这与 v0.1 1-shot Pass 2「全成或全败」不同 — multi-route 下「部分成功」是正常状态
//
// re_extract 路径(单元素重抠)保留 1-shot 单图调用,不走分组逻辑(单元素天然只有 1 路)

import { promises as fs } from 'node:fs'
import path from 'node:path'

import type { Element, Page, ProviderConfig, State, PipelinePassKind } from '@/lib/types'
import { DATA_ROOT } from '@/lib/fs-utils'
import { loadConfig } from '@/lib/config'
import { callImageGen } from '@/lib/llm-client'
import { getState, setPipelineStatus } from '@/lib/states'
import { getPage } from '@/lib/pages'
import { getProject } from '@/lib/projects'
import { getElementsByPage } from '@/lib/elements'
import { createRun, completeRun, failRun } from '@/lib/pipelines'
import { acquireLock, releaseLock, RunLockConflictError } from '@/lib/run-lock'
import { chromaGreenKey } from '@/lib/alpha-key'
import { sliceAssets } from '@/lib/slicer'
import { createOrUpdateAsset, writeAssetBinary } from '@/lib/assets'
import { renderPass2RoutePrompt } from '@/lib/prompts/render-pass2-route'
import { cropFromBbox } from '@/lib/bbox-crop'
import { type VisualCategory } from '@/lib/visual-category'

export type Pass2Result = { run_id: string; created_assets: number }

export async function runPass2(
  stateId: string,
  options?: { onlyElementId?: string },
): Promise<Pass2Result> {
  const lockKey = `state:${stateId}`
  try {
    acquireLock(lockKey, `pass2-${Date.now()}`)
  } catch (e) {
    if (e instanceof RunLockConflictError) {
      throw new Error('该状态正在跑 pipeline,稍候再试')
    }
    throw e
  }

  // re_extract(单元素重抠)走原 1-shot 路径
  if (options?.onlyElementId) {
    try {
      return await runReExtract(stateId, options.onlyElementId)
    } finally {
      releaseLock(lockKey)
    }
  }

  // 全量 Pass 2:按 visual_category 分组并行
  let totalRunId: string | null = null
  try {
    const state = await getState(stateId)
    if (!state) throw new Error('state not found')
    const page = await getPage(state.page_id)
    if (!page) throw new Error('page not found')
    const project = await getProject(page.project_id)
    if (!project) throw new Error('project not found')

    const config = await loadConfig()
    const provider = config.providers.find((p) => p.kind === 'image_gen' && p.active)
    if (!provider) throw new Error('未配置 active image_gen provider(去 /settings/models 设置)')

    const allElements = await getElementsByPage(state.page_id)
    const staticElements = allElements.filter((e) => e.type === 'static')
    if (staticElements.length === 0) throw new Error('没有 type=static 元素可提取')

    const staticByCategory = groupByCategory(staticElements)

    // 总 run(顶层 pass2)记录整体 multi-route 编排
    const totalRun = await createRun({
      state_id: stateId,
      pass: 'pass2',
      llm_request: {
        provider_id: provider.id,
        model: provider.model ?? '',
        prompt: '[multi-route Pass 2 — see sub-runs by category]',
        images: [state.original_image_path],
        extra: {
          categories: Array.from(staticByCategory.keys()),
          element_count: staticElements.length,
        },
      },
    })
    totalRunId = totalRun.id
    await setPipelineStatus(stateId, 'pass2_running', { pass2_run_id: totalRun.id })

    // 读原图(只读一次,所有路共用)
    const rawBuf = await fs.readFile(path.join(DATA_ROOT, 'raw', `${stateId}.png`))
    const rawDataUrl = `data:image/png;base64,${rawBuf.toString('base64')}`
    const pageDesc = project.description ?? page.name

    // 每 visual_category 一路并行
    const routeResults = await Promise.allSettled(
      Array.from(staticByCategory.entries()).map(([cat, els]) =>
        runRoute({
          stateId,
          state,
          provider,
          rawBuf,
          rawDataUrl,
          pageDesc,
          category: cat,
          elements: els,
        }),
      ),
    )

    const summary = routeResults.map((s) =>
      s.status === 'fulfilled' ? s.value : { ok: false as const, error: 'rejected' },
    )
    const okRoutes = summary.filter((s) => s.ok).length
    const totalCreated = summary.reduce(
      (a, s) => a + (s.ok ? s.sliced : 0),
      0,
    )

    await setPipelineStatus(stateId, 'pass2_done')
    await completeRun(totalRunId, {
      llm_response: { successful_routes: okRoutes, total_routes: summary.length },
      parsed_result: {
        by_route: summary,
        created_assets: totalCreated,
        element_count: staticElements.length,
      },
    })

    return { run_id: totalRunId, created_assets: totalCreated }
  } catch (err) {
    if (totalRunId) {
      await failRun(totalRunId, {
        code: 'PASS2_ERROR',
        message: (err as Error).message,
        retryable: true,
      })
    }
    await setPipelineStatus(stateId, 'pass2_failed')
    throw err
  } finally {
    releaseLock(lockKey)
  }
}

// =============================================================================
// 单路执行:某 visual_category 的全部 elements 一次 image_gen 调用 + chroma key + 切片 + 写 assets
// 失败时:该路所有 elements 标 status=failed,但不抛出(由 caller 的 Promise.allSettled 收集)
// =============================================================================

type RouteCtx = {
  stateId: string
  state: State
  provider: ProviderConfig
  rawBuf: Buffer
  rawDataUrl: string
  pageDesc: string
  category: VisualCategory
  elements: Element[]
}

type RouteResult =
  | { ok: true; category: VisualCategory; sliced: number; expected: number }
  | { ok: false; category: VisualCategory; error: string; sliced?: never }

async function runRoute(ctx: RouteCtx): Promise<RouteResult> {
  const { stateId, state, provider, rawBuf, rawDataUrl, pageDesc, category, elements } = ctx

  const subPass: PipelinePassKind = `pass2_${category}` as PipelinePassKind
  const subRun = await createRun({
    state_id: stateId,
    pass: subPass,
    llm_request: {
      provider_id: provider.id,
      model: provider.model ?? '',
      prompt: `[only-${category}]`,
      images: [state.original_image_path],
      extra: { category, element_ids: elements.map((e) => e.id) },
    },
  })

  try {
    // 1. 生成 crops(顺序与 elements 一致)
    const crops: string[] = []
    for (const el of elements) {
      const cropBuf = await cropFromBbox(rawBuf, el.bbox, {
        width: state.width,
        height: state.height,
      })
      crops.push(`data:image/png;base64,${cropBuf.toString('base64')}`)
    }

    // 2. 调 image_gen(主图 + crops)
    const promptText = renderPass2RoutePrompt(category, elements, pageDesc)
    const { image: greenScreenPng, cost } = await callImageGen(provider, {
      prompt: promptText,
      reference_image_base64: rawDataUrl,
      reference_image_base64s: crops,
      size: '1:1',
      resolution: '1k',
      quality: provider.default_quality ?? 'high',
      n: 1,
    })

    // 3. 留底绿幕图 + chroma key + 切片
    const pass2Dir = path.join(DATA_ROOT, 'pass2')
    await fs.mkdir(pass2Dir, { recursive: true })
    await fs.writeFile(path.join(pass2Dir, `${stateId}-${category}.png`), greenScreenPng)

    const keyedPng = await chromaGreenKey(greenScreenPng)
    const keyedDir = path.join(DATA_ROOT, 'keyed')
    await fs.mkdir(keyedDir, { recursive: true })
    await fs.writeFile(path.join(keyedDir, `${stateId}-${category}.png`), keyedPng)

    const slices = await sliceAssets(keyedPng, {
      gap: 15,
      padding: 5,
      min_size: 30,
      min_opaque_pct: 1,
    })

    // 4. 切片 → element 映射:严格在该路 elements 范围内匹配,不跨 category 串
    //    模型多画的切片(超出 elements 数量)直接丢弃
    //    模型漏画的元素(slices < elements)在该路也无对应 asset(用户在 Asset Review 看到空)
    const limit = Math.min(elements.length, slices.length)
    for (let i = 0; i < limit; i++) {
      const el = elements[i]!
      const slice = slices[i]!
      await writeAssetBinary(el.id, slice.buffer)
      const meta = await sharpDims(slice.buffer)
      await createOrUpdateAsset({
        id: el.id,
        element_id: el.id,
        page_id: state.page_id,
        width: meta.width,
        height: meta.height,
        alpha_quality: slice.opaque_pct / 100,
      })
    }

    await completeRun(subRun.id, {
      llm_response: { cost: cost ?? null },
      parsed_result: {
        category,
        element_count: elements.length,
        slice_count: slices.length,
        created_assets: limit,
      },
    })
    return { ok: true, category, sliced: limit, expected: elements.length }
  } catch (err) {
    const errMsg = (err as Error).message
    await failRun(subRun.id, {
      code: `PASS2_ROUTE_${category.toUpperCase()}_ERROR`,
      message: errMsg,
      retryable: true,
    })
    // 该路 elements 标 failed(不抛出,允许其他路完成)
    for (const el of elements) {
      await createOrUpdateAsset({
        id: el.id,
        element_id: el.id,
        page_id: state.page_id,
        width: 0,
        height: 0,
        alpha_quality: 0,
        status: 'failed',
      })
    }
    return { ok: false, category, error: errMsg }
  }
}

function groupByCategory(els: Element[]): Map<VisualCategory, Element[]> {
  const m = new Map<VisualCategory, Element[]>()
  for (const e of els) {
    const cat = (e.visual_category ?? 'other') as VisualCategory
    const list = m.get(cat) ?? []
    list.push(e)
    m.set(cat, list)
  }
  return m
}

// =============================================================================
// re_extract:单元素重抠保留原 1-shot 路径(MVP-α 行为不变)
// =============================================================================

async function runReExtract(stateId: string, elementId: string): Promise<Pass2Result> {
  let runId: string | null = null
  try {
    const state = await getState(stateId)
    if (!state) throw new Error('state not found')
    const page = await getPage(state.page_id)
    if (!page) throw new Error('page not found')
    const project = await getProject(page.project_id)
    if (!project) throw new Error('project not found')

    const config = await loadConfig()
    const provider = config.providers.find((p) => p.kind === 'image_gen' && p.active)
    if (!provider) throw new Error('未配置 active image_gen provider(去 /settings/models 设置)')

    const allElements = await getElementsByPage(state.page_id)
    const targetEls = allElements.filter((e) => e.type === 'static' && e.id === elementId)
    if (targetEls.length === 0) throw new Error('指定的 element 不是 static 或不存在')

    const run = await createRun({
      state_id: stateId,
      pass: 're_extract',
      llm_request: {
        provider_id: provider.id,
        model: provider.model ?? '',
        prompt: '[Pass 2 prompt 见 parsed_result]',
        images: [state.original_image_path],
        extra: { element_id: elementId },
      },
    })
    runId = run.id
    await setPipelineStatus(stateId, 'pass2_running', { pass2_run_id: run.id })

    const elementSummary = renderElementSummary(targetEls)
    const elementCount = targetEls.length
    const pageDescription = project.description ?? page.name
    const promptText = config.prompts.pass2_extract
      .replace(/\{\{page_description\}\}/g, pageDescription)
      .replace(/\{\{element_summary\}\}/g, elementSummary)
      .replace(/\{\{element_count\}\}/g, String(elementCount))

    const rawBuf = await fs.readFile(path.join(DATA_ROOT, 'raw', `${stateId}.png`))
    const refDataUrl = `data:image/png;base64,${rawBuf.toString('base64')}`

    const { image: greenScreenPng, cost } = await callImageGen(provider, {
      prompt: promptText,
      reference_image_base64: refDataUrl,
      size: '1:1',
      resolution: '1k',
      quality: provider.default_quality ?? 'high',
      n: 1,
    })

    const pass2Dir = path.join(DATA_ROOT, 'pass2')
    await fs.mkdir(pass2Dir, { recursive: true })
    await fs.writeFile(path.join(pass2Dir, `${stateId}-re-${elementId}.png`), greenScreenPng)

    const keyedPng = await chromaGreenKey(greenScreenPng)
    const keyedDir = path.join(DATA_ROOT, 'keyed')
    await fs.mkdir(keyedDir, { recursive: true })
    await fs.writeFile(path.join(keyedDir, `${stateId}-re-${elementId}.png`), keyedPng)

    const slices = await sliceAssets(keyedPng, {
      gap: 15,
      padding: 5,
      min_size: 30,
      min_opaque_pct: 1,
    })
    if (slices.length === 0) throw new Error('单元素重抠未切出任何 asset')
    const best = slices.reduce(
      (acc, s) => (s.opaque_pct > acc.opaque_pct ? s : acc),
      slices[0]!,
    )
    await writeAssetBinary(elementId, best.buffer)
    const meta = await sharpDims(best.buffer)
    await createOrUpdateAsset({
      id: elementId,
      element_id: elementId,
      page_id: state.page_id,
      width: meta.width,
      height: meta.height,
      alpha_quality: best.opaque_pct / 100,
    })

    await setPipelineStatus(stateId, 'pass2_done')
    await completeRun(run.id, {
      llm_response: { cost: cost ?? null },
      parsed_result: {
        element_count: elementCount,
        slice_count: slices.length,
        created_assets: 1,
        prompt_length: promptText.length,
      },
    })

    return { run_id: run.id, created_assets: 1 }
  } catch (err) {
    if (runId) {
      await failRun(runId, {
        code: 'PASS2_ERROR',
        message: (err as Error).message,
        retryable: true,
      })
    }
    await setPipelineStatus(stateId, 'pass2_failed')
    throw err
  }
}

// 按 name 分组渲染(SPEC § Pass 2 prompt 模板 § element_summary 渲染规则)
// 仅 re_extract 路径仍在用;全量 Pass 2 已改为 renderPass2RoutePrompt
export function renderElementSummary(elements: Element[]): string {
  const groups = new Map<string, Element[]>()
  for (const el of elements) {
    const key = el.name.trim()
    const list = groups.get(key) ?? []
    list.push(el)
    groups.set(key, list)
  }
  const lines: string[] = []
  for (const [name, list] of groups) {
    if (list.length === 1) {
      const el = list[0]!
      lines.push(`- ${name}(${el.description}`.trim() + ')')
    } else {
      const descs = list.map((e) => e.description.slice(0, 40)).join(';')
      lines.push(`- ${name} 共 ${list.length} 个(${descs})`)
    }
  }
  return lines.join('\n')
}

async function sharpDims(buf: Buffer): Promise<{ width: number; height: number }> {
  const sharp = (await import('sharp')).default
  const m = await sharp(buf).metadata()
  return { width: m.width ?? 0, height: m.height ?? 0 }
}

// 仅在测试中用得到的辅助
export type { ProviderConfig, Page, State }
