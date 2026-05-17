import { NextRequest } from 'next/server'
import { promises as fs } from 'node:fs'
import {
  getState,
  getPage,
  getProject,
  updateState,
} from '@/lib/projects'
import {
  getElementsForPage,
  createPipelineRun,
  updatePipelineRun,
} from '@/lib/elements'
import { listAssetsForPage, saveAsset } from '@/lib/assets'
import { withStateLock, isStateLocked, StateBusyError } from '@/lib/run-lock'
import { errorToResponse, jsonResponse } from '@/lib/api-response'
import { newId, nowIso, isValidId } from '@/lib/id'
import { paths } from '@/lib/fs-utils'
import { getActiveProvider } from '@/lib/config'
import { callMllm, type MllmMessage } from '@/lib/llm-client'
import { ALL_VISUAL_CATEGORIES } from '@/lib/visual-category'
import {
  renderValidateSystemPrompt,
  renderValidateUserText,
  parseValidateResponse,
} from '@/lib/prompts/render-validate'
import type { Asset, VisualCategory } from '@/lib/types'

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * POST /api/states/[id]/validate
 * 逐 category 跑反向校验。结果写到 Asset.alpha_quality / contamination / validation_notes。
 * 不阻断:即使所有 element 校验失败,用户仍可继续(HANDOFF §6.4)。
 */
export async function POST(_req: NextRequest, { params }: RouteParams): Promise<Response> {
  try {
    const { id: stateId } = await params
    if (!isValidId(stateId)) return jsonResponse({ error: 'invalid id' }, { status: 400 })
    const state = await getState(stateId)
    if (!state) return jsonResponse({ error: 'state not found' }, { status: 404 })
    if (isStateLocked(stateId)) return jsonResponse({ error: 'state busy' }, { status: 409 })

    const page = await getPage(state.page_id)
    if (!page) return jsonResponse({ error: 'page not found' }, { status: 404 })
    const project = await getProject(page.project_id)
    if (!project) return jsonResponse({ error: 'project not found' }, { status: 404 })

    const provider = await getActiveProvider('mllm')
    if (!provider) return jsonResponse({ error: '无 active mllm provider' }, { status: 412 })

    const auditRun = {
      id: newId(),
      state_id: stateId,
      pass: 'validate' as const,
      status: 'running' as const,
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
    await createPipelineRun(auditRun)
    await updateState(stateId, { pipeline_status: 'validating', validate_run_id: auditRun.id })

    void (async () => {
      try {
        await withStateLock(stateId, async () => {
          const elements = await getElementsForPage(state.page_id)
          const statics = elements.filter((e) => e.type === 'static')
          const assets = await listAssetsForPage(state.page_id)
          const assetByElement = new Map<string, Asset>()
          for (const a of assets) assetByElement.set(a.element_id, a)

          // 按 category 分组(只看有 keyed/{state}-{cat}.png 存在的 category)
          const perCategory: Array<{
            category: VisualCategory
            elements: typeof statics
          }> = []
          for (const cat of ALL_VISUAL_CATEGORIES) {
            const els = statics.filter((e) => e.visual_category === cat)
            if (els.length === 0) continue
            // 检查 keyed 存在
            try {
              await fs.access(paths.keyed(state.id, cat))
            } catch {
              continue
            }
            perCategory.push({ category: cat, elements: els })
          }

          let totalParsed = 0
          for (const { category, elements: catEls } of perCategory) {
            const keyedBuf = await fs.readFile(paths.keyed(state.id, category))
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
              console.warn(`[validate ${category}]`, err)
            }
          }

          await updatePipelineRun(auditRun.id, {
            status: 'completed',
            completed_at: nowIso(),
            parsed_result: { categories_validated: perCategory.length, elements_evaluated: totalParsed },
          })
        })
        await updateState(stateId, { pipeline_status: 'validated' })
      } catch (err) {
        if (err instanceof StateBusyError) return
        const message = err instanceof Error ? err.message : String(err)
        console.error(`[validate ${auditRun.id}]`, message)
        await updatePipelineRun(auditRun.id, {
          status: 'failed',
          completed_at: nowIso(),
          error: { code: 'VALIDATE_ERROR', message, retryable: true },
        }).catch(() => {})
        // 状态退回 pass2_done(校验失败不影响 pass2 完成)
        await updateState(stateId, { pipeline_status: 'pass2_done' }).catch(() => {})
      }
    })()

    return jsonResponse({ run_id: auditRun.id }, { status: 202 })
  } catch (err) {
    return errorToResponse(err)
  }
}
