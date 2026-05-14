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
import { listMultiRouteFiles } from '@/lib/multi-png-stack'
import { callMatting } from '@/lib/matting-client'
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
      throw new Error('该设计稿正在跑 pipeline,稍候再试')
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
    //    Phase 8f BUG #1:单 element crop 失败 → 标 failed asset + skip,不阻断该路其他 elements
    const crops: string[] = []
    const validElements: Element[] = []
    for (const el of elements) {
      try {
        const cropBuf = await cropFromBbox(rawBuf, el.bbox, {
          width: state.width,
          height: state.height,
        })
        crops.push(`data:image/png;base64,${cropBuf.toString('base64')}`)
        validElements.push(el)
      } catch (cropErr) {
        // 该 element 的 bbox 让 cropFromBbox 抛(NaN / 真零面积)— 标 failed,继续下一个
        console.warn(
          `[pass2-runner] skip ${el.id} (${el.name}) crop: ${(cropErr as Error).message}`,
        )
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
    }

    if (validElements.length === 0) {
      // 该路所有 element 的 bbox 都坏 — fail 该路 sub-run,不抛(允许其他路完成)
      await failRun(subRun.id, {
        code: `PASS2_ROUTE_${category.toUpperCase()}_NO_VALID_CROPS`,
        message: '该路所有 element bbox 都无效',
        retryable: false,
      })
      return { ok: false, category, error: 'no valid crops' }
    }

    // 2. 调 image_gen(主图 + valid crops)
    const promptText = renderPass2RoutePrompt(category, validElements, pageDesc)
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

    // 4. 切片 → element 映射:严格在该路 validElements 范围内匹配,不跨 category 串
    //    模型多画的切片(超出 elements 数量)直接丢弃
    //    模型漏画的元素(slices < elements)在该路也无对应 asset(用户在 Asset Review 看到空)
    const limit = Math.min(validElements.length, slices.length)
    for (let i = 0; i < limit; i++) {
      const el = validElements[i]!
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
        element_count: validElements.length,
        slice_count: slices.length,
        created_assets: limit,
      },
    })
    return { ok: true, category, sliced: limit, expected: validElements.length }
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

// =============================================================================
// reKeyViaApi:用户手动触发的 API 抠图(Asset Review 「用 API 抠图」按钮)
//
// 复用 pass2/{stateId}-{cat}.png 绿幕原图,送给抠图 provider(首发 koukoutu sync),
// 拿到透明 PNG 后覆写 keyed/{stateId}-{cat}.png + 重切片 + 刷新该 category 的 asset。
// 默认 pipeline 不动 — 仍是绿幕 + chroma key,这条只在用户主动点按钮时跑。
//
// 部分失败容忍:某 category 抠图失败 → 该 category 的 asset 不动(保留旧 chroma key 结果),
// 不像 Pass 2 那样把 asset 标 status=failed。理由:这是用户主动 retry,不该把好的旧结果覆盖坏。
//
// 写顺序:matting + slice 都成功后才覆写 keyed/ + 更新 asset。中间任意步骤抛错都不留半成品。
// =============================================================================

export type ReKeyResult = {
  run_id: string
  refreshed: number
  failed_routes: { category: string; error: string }[]
}

export async function reKeyViaApi(stateId: string): Promise<ReKeyResult> {
  const lockKey = `state:${stateId}`
  try {
    acquireLock(lockKey, `rekey-${Date.now()}`)
  } catch (e) {
    if (e instanceof RunLockConflictError) {
      throw new Error('该设计稿正在跑 pipeline,稍候再试')
    }
    throw e
  }

  let runId: string | null = null
  try {
    const state = await getState(stateId)
    if (!state) throw new Error('state not found')

    const config = await loadConfig()
    const provider = config.providers.find((p) => p.kind === 'matting' && p.active)
    if (!provider) {
      throw new Error('未配置 active matting provider(去 /settings/models 设置)')
    }

    const allElements = await getElementsByPage(state.page_id)
    const staticElements = allElements.filter((e) => e.type === 'static')
    const elementsByCategory = groupByCategory(staticElements)

    const pass2Dir = path.join(DATA_ROOT, 'pass2')
    const files = await listMultiRouteFiles(pass2Dir, stateId)
    if (files.length === 0) {
      throw new Error('pass2 raw 不存在,请先跑一次 Pass 2')
    }

    const run = await createRun({
      state_id: stateId,
      pass: 're_extract',
      llm_request: {
        provider_id: provider.id,
        model: provider.model ?? 'background-removal',
        prompt: '[matting API re-key — replaces chroma green key]',
        images: [state.original_image_path],
        extra: {
          method: 'matting_api',
          api_format: provider.api_format,
          file_count: files.length,
        },
      },
    })
    runId = run.id

    const failed: { category: string; error: string }[] = []
    let refreshed = 0
    const keyedDir = path.join(DATA_ROOT, 'keyed')
    await fs.mkdir(keyedDir, { recursive: true })

    for (const file of files) {
      const cat = inferCategoryFromFilename(file, stateId)
      const greenScreenPng = await fs.readFile(file)
      try {
        const transparentPng = await callMatting(provider, { png: greenScreenPng })
        const slices = await sliceAssets(transparentPng, {
          gap: 15,
          padding: 5,
          min_size: 30,
          min_opaque_pct: 1,
        })
        await fs.writeFile(path.join(keyedDir, `${stateId}-${cat}.png`), transparentPng)

        const els = elementsByCategory.get(cat as VisualCategory) ?? []
        const limit = Math.min(els.length, slices.length)
        for (let i = 0; i < limit; i++) {
          const el = els[i]!
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
          refreshed++
        }
      } catch (err) {
        failed.push({ category: cat, error: (err as Error).message })
      }
    }

    if (failed.length === files.length) {
      throw new Error(`API 抠图全部失败(${failed.length} 路):${failed[0]?.error ?? ''}`)
    }

    await completeRun(run.id, {
      llm_response: {
        successful_routes: files.length - failed.length,
        total_routes: files.length,
      },
      parsed_result: {
        refreshed,
        failed_routes: failed,
        method: 'matting_api',
      },
    })
    return { run_id: run.id, refreshed, failed_routes: failed }
  } catch (err) {
    if (runId) {
      await failRun(runId, {
        code: 'REKEY_API_ERROR',
        message: (err as Error).message,
        retryable: true,
      })
    }
    throw err
  } finally {
    releaseLock(lockKey)
  }
}

// 从 pass2/{stateId}-{category}.png 推 category。VisualCategory 都是单词,无 `-`,安全。
function inferCategoryFromFilename(filePath: string, stateId: string): string {
  const base = path.basename(filePath, '.png')  // 'state_x-button'
  const prefix = `${stateId}-`
  return base.startsWith(prefix) ? base.slice(prefix.length) : base
}

// 仅在测试中用得到的辅助
export type { ProviderConfig, Page, State }
