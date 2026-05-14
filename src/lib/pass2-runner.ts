// Pass 2 主编排:渲染 prompt + 调 image_gen + 写绿幕原图 + chroma key + 切片 + 写 assets
// Phase 5 实现

import { promises as fs } from 'node:fs'
import path from 'node:path'

import type { Element, Page, ProviderConfig, State } from '@/lib/types'
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

export type Pass2Result = { run_id: string; created_assets: number }

export async function runPass2(stateId: string, options?: { onlyElementId?: string }): Promise<Pass2Result> {
  const lockKey = `state:${stateId}`
  try {
    acquireLock(lockKey, `pass2-${Date.now()}`)
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
    const provider = config.providers.find((p) => p.kind === 'image_gen' && p.active)
    if (!provider) throw new Error('未配置 active image_gen provider(去 /settings/models 设置)')

    // 取 type=static elements + 可选过滤单个 element
    const allElements = await getElementsByPage(state.page_id)
    let staticElements = allElements.filter((e) => e.type === 'static')
    if (options?.onlyElementId) {
      staticElements = staticElements.filter((e) => e.id === options.onlyElementId)
      if (staticElements.length === 0) throw new Error('指定的 element 不是 static 或不存在')
    }
    if (staticElements.length === 0) throw new Error('没有 type=static 元素可提取')

    // 创建 PipelineRun + 标 running
    const run = await createRun({
      state_id: stateId,
      pass: options?.onlyElementId ? 're_extract' : 'pass2',
      llm_request: {
        provider_id: provider.id,
        model: provider.model ?? '',
        prompt: '[Pass 2 prompt 见 parsed_result]',
        images: [state.original_image_path],
        extra: {},
      },
    })
    runId = run.id
    await setPipelineStatus(stateId, 'pass2_running', { pass2_run_id: run.id })

    // 渲染 element_summary + 拼 prompt
    const elementSummary = renderElementSummary(staticElements)
    const elementCount = staticElements.length
    const pageDescription = project.description ?? page.name
    const promptText = config.prompts.pass2_extract
      .replace(/\{\{page_description\}\}/g, pageDescription)
      .replace(/\{\{element_summary\}\}/g, elementSummary)
      .replace(/\{\{element_count\}\}/g, String(elementCount))

    // 读 raw PNG → data URL
    const rawBuf = await fs.readFile(path.join(DATA_ROOT, 'raw', `${stateId}.png`))
    const refDataUrl = `data:image/png;base64,${rawBuf.toString('base64')}`

    // 调 image_gen
    const callOpts: Parameters<typeof callImageGen>[1] = {
      prompt: promptText,
      reference_image_base64: refDataUrl,
      size: '1:1',
      resolution: '1k',
      quality: provider.default_quality ?? 'high',
      n: 1,
    }
    const { image: greenScreenPng, cost } = await callImageGen(provider, callOpts)

    // 写 data/pass2/{state_id}.png 留底
    const pass2Dir = path.join(DATA_ROOT, 'pass2')
    await fs.mkdir(pass2Dir, { recursive: true })
    await fs.writeFile(path.join(pass2Dir, `${stateId}.png`), greenScreenPng)

    // chroma green key
    const keyedPng = await chromaGreenKey(greenScreenPng)
    const keyedDir = path.join(DATA_ROOT, 'keyed')
    await fs.mkdir(keyedDir, { recursive: true })
    await fs.writeFile(path.join(keyedDir, `${stateId}.png`), keyedPng)

    // 切片
    const slices = await sliceAssets(keyedPng, { gap: 15, padding: 5, min_size: 30, min_opaque_pct: 1 })

    // 元素到切片映射:Phase 5 用「按位置排序 + 数量对应」
    // re_extract 模式下:取最大 opaque_pct 的切片替换该 element 的 asset
    let createdCount = 0
    if (options?.onlyElementId) {
      if (slices.length === 0) {
        throw new Error('单元素重抠未切出任何 asset')
      }
      const best = slices.reduce((acc, s) => (s.opaque_pct > acc.opaque_pct ? s : acc), slices[0]!)
      await writeAssetBinary(options.onlyElementId, best.buffer)
      const meta = await sharpDims(best.buffer)
      await createOrUpdateAsset({
        id: options.onlyElementId,
        element_id: options.onlyElementId,
        page_id: state.page_id,
        width: meta.width,
        height: meta.height,
        alpha_quality: best.opaque_pct / 100,
      })
      createdCount = 1
    } else {
      // 全量:静态元素按 element list 顺序与切片 (y,x) 排序对齐
      const limit = Math.min(staticElements.length, slices.length)
      for (let i = 0; i < limit; i++) {
        const el = staticElements[i]!
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
        createdCount++
      }
    }

    await setPipelineStatus(stateId, 'pass2_done')
    await completeRun(run.id, {
      llm_response: { cost: cost ?? null },
      parsed_result: {
        element_count: elementCount,
        slice_count: slices.length,
        created_assets: createdCount,
        prompt_length: promptText.length,
      },
    })

    return { run_id: run.id, created_assets: createdCount }
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
  } finally {
    releaseLock(lockKey)
  }
}

// 按 name 分组渲染(SPEC § Pass 2 prompt 模板 § element_summary 渲染规则)
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
      // 取每个的 description 关键差异点(粗略:把 description 截短)
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
