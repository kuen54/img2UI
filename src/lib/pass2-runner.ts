// HANDOFF §6:Pass 2 按 visual_category 6 路并行,多参考图,部分失败容忍。
// MVP S3:不创建 Asset,仅写绿幕 + chroma keyed + 切片落盘到切片库。
// 用户在 Asset Review 拖切片到 element 时才 createAsset。

import { promises as fs } from 'node:fs'
import type {
  LayoutElement,
  StateRecord,
  VisualCategory,
  ProviderConfig,
  PipelineRun,
  PipelinePassKind,
  Page,
  Project,
} from './types'
import { newId, nowIso } from './id'
import { paths, writeAtomic } from './fs-utils'
import { callImageGen } from './llm-client'
import { getActiveProvider, getConfig } from './config'
import { ALL_VISUAL_CATEGORIES } from './visual-category'
import { chromaGreenKey } from './alpha-key'
import { sliceAssets } from './slicer'
import { writeSlice } from './slices'
import { cropFromBbox, bufferToDataUrl } from './bbox-crop'
import {
  renderPass2RoutePrompt,
  renderPass2ReExtract,
} from './prompts/render-pass2-route'
import { createPipelineRun, updatePipelineRun } from './elements'

export interface Pass2RouteResult {
  category: VisualCategory
  elementCount: number
  sliceCount: number
  subRunId: string
}

export interface Pass2RouteFailure {
  category: VisualCategory
  error: string
  elementIds: string[]
}

export interface Pass2MultiResult {
  successes: Pass2RouteResult[]
  failures: Pass2RouteFailure[]
  /** 该 state 全部 type=static elements(在所有路次中) */
  totalStaticCount: number
}

/**
 * Pass 2 multi-route:按 visual_category 分组并行。
 * 部分失败容忍:单路 fail 不阻断其他路。
 */
export async function runPass2MultiRoute(input: {
  state: StateRecord
  page: Page
  project: Project
  elements: LayoutElement[]
}): Promise<Pass2MultiResult> {
  const { state, page, project, elements } = input

  const provider = await getActiveProvider('image_gen')
  if (!provider) {
    throw new Error('未配置 active image_gen provider')
  }

  // 仅 type=static 进 Pass 2
  const statics = elements.filter((e) => e.type === 'static')
  const totalStaticCount = statics.length

  // 按 visual_category 分组
  const byCat = new Map<VisualCategory, LayoutElement[]>()
  for (const cat of ALL_VISUAL_CATEGORIES) {
    byCat.set(cat, [])
  }
  for (const el of statics) {
    byCat.get(el.visual_category)!.push(el)
  }

  const pageDescription = project.description ?? page.name
  const rawBuf = await fs.readFile(paths.raw(state.id))

  const tasks: Array<{ category: VisualCategory; els: LayoutElement[] }> = []
  for (const [cat, els] of byCat) {
    if (els.length > 0) tasks.push({ category: cat, els })
  }

  const settled = await Promise.allSettled(
    tasks.map((t) =>
      runRoute({
        state,
        provider,
        category: t.category,
        elements: t.els,
        pageDescription,
        rawBuf,
      }),
    ),
  )

  const successes: Pass2RouteResult[] = []
  const failures: Pass2RouteFailure[] = []
  for (let i = 0; i < settled.length; i++) {
    const t = tasks[i]!
    const r = settled[i]!
    if (r.status === 'fulfilled') {
      successes.push(r.value)
    } else {
      const message = r.reason instanceof Error ? r.reason.message : String(r.reason)
      failures.push({
        category: t.category,
        error: message,
        elementIds: t.els.map((e) => e.id),
      })
    }
  }

  return { successes, failures, totalStaticCount }
}

// ─── 单路 sub-run ──────────────────────────────────────────────────────────

async function runRoute(input: {
  state: StateRecord
  provider: ProviderConfig
  category: VisualCategory
  elements: LayoutElement[]
  pageDescription: string
  rawBuf: Buffer
}): Promise<Pass2RouteResult> {
  const { state, provider, category, elements, pageDescription, rawBuf } = input

  const subRun: PipelineRun = {
    id: newId(),
    state_id: state.id,
    pass: `pass2_${category}` as PipelinePassKind,
    status: 'running',
    started_at: nowIso(),
    llm_request: {
      provider_id: provider.id,
      model: provider.model ?? '',
      prompt: '(待 prompt 渲染后填)',
      images: [paths.raw(state.id)],
      extra: { category, element_count: elements.length },
    },
    llm_response: null,
  }
  await createPipelineRun(subRun)

  try {
    // 1. 准备多参考图:[原图, ...每个 element 的 crop]
    const validElements: LayoutElement[] = []
    const cropDataUrls: string[] = []
    for (const el of elements) {
      try {
        const { buffer } = await cropFromBbox(rawBuf, el.bbox)
        cropDataUrls.push(await bufferToDataUrl(buffer))
        validElements.push(el)
      } catch (err) {
        // 单 element crop 失败 → 跳过该 element
        console.warn(
          `[pass2 ${category}] crop ${el.name} (${el.id}) failed: ${err instanceof Error ? err.message : err}`,
        )
      }
    }
    if (validElements.length === 0) {
      throw new Error(`所有 ${elements.length} 个 element 的 crop 都失败`)
    }

    // 2. 渲染 prompt
    const prompt = renderPass2RoutePrompt({
      category,
      elements: validElements,
      pageDescription,
    })
    await updatePipelineRun(subRun.id, {
      llm_request: {
        ...subRun.llm_request,
        prompt,
      },
    })

    // 3. 调 image_gen
    const mainDataUrl = await bufferToDataUrl(rawBuf)
    const result = await callImageGen(provider, {
      prompt,
      reference_image_base64: mainDataUrl,
      reference_image_base64s: cropDataUrls,
      size: '1:1',
      resolution: '1k',
      quality: 'high',
      n: 1,
    })

    // 4. 落 data/pass2/{state}-{cat}.png(留底,re-key-via-api 复用)
    await writeAtomic(paths.pass2GreenScreen(state.id, category), result.image)

    // 5. chroma key
    const transparent = await chromaGreenKey(result.image)
    await writeAtomic(paths.keyed(state.id, category), transparent)

    // 6. slice
    const slices = await sliceAssets(transparent)

    // 7. 写到切片库(MVP S3:不创建 Asset)
    for (let i = 0; i < slices.length; i++) {
      const s = slices[i]!
      await writeSlice(state.id, category, i, s.buffer, {
        opaque_pct: s.opaque_pct,
        bbox: s.bbox,
      })
    }

    await updatePipelineRun(subRun.id, {
      status: 'completed',
      completed_at: nowIso(),
      llm_response: { latency_ms: result.latency_ms, cost: result.cost ?? null },
      parsed_result: {
        slice_count: slices.length,
        element_count: validElements.length,
      },
    })

    return {
      category,
      elementCount: validElements.length,
      sliceCount: slices.length,
      subRunId: subRun.id,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await updatePipelineRun(subRun.id, {
      status: 'failed',
      completed_at: nowIso(),
      error: { code: 'PASS2_ROUTE_ERROR', message, retryable: true },
    }).catch(() => {})
    throw err
  }
}

// ─── re_extract 单元素重抠 ─────────────────────────────────────────────────

export interface ReExtractResult {
  /** 新切片(已写入 data/slices/{state}-{cat}/{idx}.png) */
  newSliceIdx: number
  newSliceCategory: VisualCategory
  subRunId: string
}

/**
 * 单元素重抠:1-shot 单图模板,只传原图(不传 crops)。
 * 完成后该 element 自动获得新 slice — caller 应调 assignSliceToElement 完成自动指派。
 */
export async function runReExtract(input: {
  state: StateRecord
  page: Page
  project: Project
  element: LayoutElement
}): Promise<ReExtractResult> {
  const { state, page, project, element } = input

  const provider = await getActiveProvider('image_gen')
  if (!provider) {
    throw new Error('未配置 active image_gen provider')
  }

  const config = await getConfig()
  const template = config.prompts.pass2_extract
  const pageDescription = project.description ?? page.name
  const prompt = renderPass2ReExtract({
    template,
    pageDescription,
    element,
  })

  const subRun: PipelineRun = {
    id: newId(),
    state_id: state.id,
    pass: 're_extract',
    status: 'running',
    started_at: nowIso(),
    llm_request: {
      provider_id: provider.id,
      model: provider.model ?? '',
      prompt,
      images: [paths.raw(state.id)],
      extra: { element_id: element.id, element_name: element.name },
    },
    llm_response: null,
  }
  await createPipelineRun(subRun)

  try {
    const rawBuf = await fs.readFile(paths.raw(state.id))
    const mainDataUrl = await bufferToDataUrl(rawBuf)

    const result = await callImageGen(provider, {
      prompt,
      reference_image_base64: mainDataUrl,
      // re_extract 不传 crops(单元素无歧义)
      size: '1:1',
      resolution: '1k',
      quality: 'high',
      n: 1,
    })

    // chroma + slice
    const transparent = await chromaGreenKey(result.image)
    const slices = await sliceAssets(transparent)
    if (slices.length === 0) {
      throw new Error('chroma + slice 后无切片产生')
    }
    // 取面积最大的切片(单元素重抠通常只有 1 个,但偶尔噪点)
    const main = slices.reduce((a, b) =>
      a.width * a.height >= b.width * b.height ? a : b,
    )
    // 写到该 element 的 visual_category 路下
    const cat = element.visual_category
    const { nextSliceIdx } = await import('./slices')
    const idx = await nextSliceIdx(state.id, cat)
    await writeSlice(state.id, cat, idx, main.buffer, {
      opaque_pct: main.opaque_pct,
      bbox: main.bbox,
    })

    await updatePipelineRun(subRun.id, {
      status: 'completed',
      completed_at: nowIso(),
      llm_response: { latency_ms: result.latency_ms, cost: result.cost ?? null },
      parsed_result: {
        new_slice_idx: idx,
        category: cat,
        slice_count: slices.length,
      },
    })

    return {
      newSliceIdx: idx,
      newSliceCategory: cat,
      subRunId: subRun.id,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await updatePipelineRun(subRun.id, {
      status: 'failed',
      completed_at: nowIso(),
      error: { code: 'RE_EXTRACT_ERROR', message, retryable: true },
    }).catch(() => {})
    throw err
  }
}
