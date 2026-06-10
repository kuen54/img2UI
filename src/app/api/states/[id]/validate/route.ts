import { NextRequest } from 'next/server'
import { promises as fs } from 'node:fs'
import { getState, getPage, getProject } from '@/lib/projects'
import { getElementsForPage } from '@/lib/elements'
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
import type { Asset, PipelineRun, VisualCategory } from '@/lib/types'

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
            // 每个 batch 单独 validate(共享同一组 element 列表 — LLM 看每张
            // 绿幕图的元素并校验)
            for (const b of batches) {
              const keyedBuf = await fs.readFile(b.keyedPath)
              const dataUrl = `data:image/png;base64,${keyedBuf.toString('base64')}`
              const messages: MllmMessage[] = [
                { role: 'system', content: renderValidateSystemPrompt() },
                {
                  role: 'user',
                  content: [
                    { type: 'text', text: renderValidateUserText({ elements: catEls }) },
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

                // match by entity_name back to element → asset
                for (const ve of parsed) {
                  const el = catEls.find((e) => e.name === ve.entity_name)
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
