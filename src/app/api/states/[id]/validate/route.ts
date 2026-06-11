import { NextRequest } from 'next/server'
import { promises as fs } from 'node:fs'
import { getState, getPage, getProject } from '@/lib/projects'
import { getElementsForPage, listPipelineRunsByState } from '@/lib/elements'
import { listAssetsForPage, saveAsset } from '@/lib/assets'
import { StateBusyError } from '@/lib/run-lock'
import { beginAuditJob } from '@/lib/audit-job'
import { errorToResponse, jsonResponse } from '@/lib/api-response'
import { newId, nowIso, isValidId } from '@/lib/id'
import { listPass2Batches } from '@/lib/fs-utils'
import { getActiveProvider } from '@/lib/config'
import { callMllm, type MllmMessage } from '@/lib/llm-client'
import { ALL_VISUAL_CATEGORIES } from '@/lib/visual-category'
import {
  renderValidateSystemPrompt,
  renderValidateUserText,
  parseValidateResponse,
} from '@/lib/prompts/render-validate'
import type {
  Asset,
  PipelineRun,
  Pass2RouteParsedResult,
  VisualCategory,
} from '@/lib/types'

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * POST /api/states/[id]/validate
 * 逐 category 跑反向校验。结果写到 Asset.alpha_quality / contamination / validation_notes。
 * 不阻断:即使所有 element 校验失败,用户仍可继续(HANDOFF §6.4)。
 * 单 batch 的 LLM / parse 失败不阻断其他 batch,但会记进 parsed_result.validation_errors。
 */
export async function POST(_req: NextRequest, { params }: RouteParams): Promise<Response> {
  try {
    const { id: stateId } = await params
    if (!isValidId(stateId)) return jsonResponse({ error: 'invalid id' }, { status: 400 })
    const state = await getState(stateId)
    if (!state) return jsonResponse({ error: 'state not found' }, { status: 404 })

    const page = await getPage(state.page_id)
    if (!page) return jsonResponse({ error: 'page not found' }, { status: 404 })
    const project = await getProject(page.project_id)
    if (!project) return jsonResponse({ error: 'project not found' }, { status: 404 })

    const provider = await getActiveProvider('mllm')
    if (!provider) return jsonResponse({ error: '无 active mllm provider' }, { status: 412 })

    const auditRun: PipelineRun = {
      id: newId(),
      state_id: stateId,
      pass: 'validate',
      status: 'running',
      started_at: nowIso(),
      llm_request: {
        provider_id: provider.id,
        model: provider.model ?? '',
        prompt: renderValidateSystemPrompt(),
        images: [],
        extra: {},
      },
      llm_response: null,
    }

    try {
      await beginAuditJob({
        stateId,
        auditRun,
        runningPatch: { pipeline_status: 'validating', validate_run_id: auditRun.id },
        doneStatus: 'validated',
        // 校验失败不影响 pass2 完成,状态退回 pass2_done
        failStatus: 'pass2_done',
        errorCode: 'VALIDATE_ERROR',
        job: async () => {
          const elements = await getElementsForPage(state.page_id)
          const statics = elements.filter((e) => e.type === 'static')
          const assets = await listAssetsForPage(state.page_id)
          const assetByElement = new Map<string, Asset>()
          for (const a of assets) assetByElement.set(a.element_id, a)

          // (category, batch_idx) → 本 batch 实际画进绿幕图的 element id 列表。
          // 从 pass2_<category> sub-run 的 parsed_result.element_ids 取(pass2-runner
          // 写入)。validate 据此把发给单张 batch 图的元素过滤成该子集,避免不在
          // 图里的元素被 LLM 误判 complete=false。同 (cat,batch) 多次跑取最新一条。
          const runs = await listPipelineRunsByState(state.id)
          const batchElementIds = new Map<string, string[]>()
          const keyFor = (cat: string, batchIdx: number): string => `${cat}#${batchIdx}`
          for (const run of runs) {
            if (run.status !== 'completed') continue
            if (!run.pass.startsWith('pass2_')) continue
            const cat = run.pass.slice('pass2_'.length)
            const pr = run.parsed_result as Pass2RouteParsedResult | undefined
            if (!pr || !Array.isArray(pr.element_ids)) continue
            const batchIdx = typeof pr.batch_idx === 'number' ? pr.batch_idx : 0
            // runs 按 started_at 升序,后写覆盖前写 → map 末值即最新
            batchElementIds.set(keyFor(cat, batchIdx), pr.element_ids)
          }

          // 按 category 分组(只看至少有一个 keyed batch 存在的 category)
          const perCategory: Array<{
            category: VisualCategory
            elements: typeof statics
            batches: Array<{ batchIdx: number; pass2Path: string; keyedPath: string }>
          }> = []
          for (const cat of ALL_VISUAL_CATEGORIES) {
            const els = statics.filter((e) => e.visual_category === cat)
            if (els.length === 0) continue
            const batches = await listPass2Batches(state.id, cat)
            if (batches.length === 0) continue
            perCategory.push({ category: cat, elements: els, batches })
          }

          let totalParsed = 0
          const validationErrors: string[] = []
          for (const { category, elements: catEls, batches } of perCategory) {
            // 每个 batch 只画了本 category 的一个子集(>15 元素时分多 batch)。
            // 必须把发给该图的元素过滤成本 batch 的子集,否则不在图里的元素会被
            // LLM 误判 complete=false。子集来自 pass2 sub-run 持久化的 element_ids。
            for (const b of batches) {
              // 本 batch 的元素子集:有映射就过滤,旧数据(无 element_ids)回退到
              // 整个 category 列表 —— 保持原有行为,不为兼容性引入回归。
              const ids = batchElementIds.get(keyFor(category, b.batchIdx))
              const idSet = ids ? new Set(ids) : null
              const batchEls = idSet
                ? catEls.filter((e) => idSet.has(e.id))
                : catEls
              if (batchEls.length === 0) continue

              // entity_name 唯一化:HANDOFF §6.4 模板只回传 entity_name(逐字契约,
              // 不能加 element_id 字段),重名元素用字符串反查会全部错配到第一个。
              // 发给 LLM 前给重名加 " (n)" 后缀,回填按唯一名精确映射回 element。
              // 作用域限于本 batch 子集 —— 唯一化与反查都只在这张图的元素里做。
              const nameCount = new Map<string, number>()
              const byUniqueName = new Map<string, (typeof batchEls)[number]>()
              const promptEls = batchEls.map((el) => {
                const n = (nameCount.get(el.name) ?? 0) + 1
                nameCount.set(el.name, n)
                const unique = n === 1 ? el.name : `${el.name} (${n})`
                byUniqueName.set(unique, el)
                return n === 1 ? el : { ...el, name: unique }
              })

              const keyedBuf = await fs.readFile(b.keyedPath)
              const dataUrl = `data:image/png;base64,${keyedBuf.toString('base64')}`
              const messages: MllmMessage[] = [
                { role: 'system', content: renderValidateSystemPrompt() },
                {
                  role: 'user',
                  content: [
                    { type: 'text', text: renderValidateUserText({ elements: promptEls }) },
                    { type: 'image_url', image_url: { url: dataUrl } },
                  ],
                },
              ]
              try {
                const result = await callMllm(provider, {
                  messages,
                  max_tokens: 4096,
                  temperature: 0,
                  response_format: { type: 'json_object' },
                })
                const parsed = parseValidateResponse(result.content)
                totalParsed += parsed.length

                // 按唯一化后的 entity_name 精确映射回 element → asset
                for (const ve of parsed) {
                  const el = byUniqueName.get(ve.entity_name)
                  if (!el) continue
                  const asset = assetByElement.get(el.id)
                  if (!asset) continue
                  const updated: Asset = {
                    ...asset,
                    alpha_quality: typeof ve.alpha_quality === 'number'
                      ? Math.max(0, Math.min(1, ve.alpha_quality))
                      : asset.alpha_quality,
                    validation_notes:
                      `complete=${ve.complete} style_match=${ve.style_match} contamination=${ve.contamination} ${ve.notes ?? ''}`.trim(),
                    status: 'validated',
                    updated_at: nowIso(),
                  }
                  await saveAsset(updated)
                }
              } catch (err) {
                // 单 batch 失败不阻断,但留底进 audit run,UI 可见
                const message = err instanceof Error ? err.message : String(err)
                console.warn(`[validate ${category} batch${b.batchIdx}]`, message)
                validationErrors.push(`${category} batch${b.batchIdx}: ${message}`)
              }
            }
          }

          return {
            categories_validated: perCategory.length,
            elements_evaluated: totalParsed,
            ...(validationErrors.length > 0
              ? { validation_errors: validationErrors }
              : {}),
          }
        },
      })
    } catch (err) {
      if (err instanceof StateBusyError)
        return jsonResponse({ error: 'state busy' }, { status: 409 })
      throw err
    }

    return jsonResponse({ run_id: auditRun.id }, { status: 202 })
  } catch (err) {
    return errorToResponse(err)
  }
}
