import { NextRequest } from 'next/server'
import { getElementsForPage, createPipelineRun, updatePipelineRun } from '@/lib/elements'
import { getState, getPage, getProject } from '@/lib/projects'
import { runReExtract } from '@/lib/pass2-runner'
import { assignSliceToElement } from '@/lib/slices'
import { withStateLock, isStateLocked, StateBusyError } from '@/lib/run-lock'
import { errorToResponse, jsonResponse } from '@/lib/api-response'
import { isValidId, newId, nowIso } from '@/lib/id'
import { paths } from '@/lib/fs-utils'

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * POST /api/elements/[id]/re-extract
 * 单元素重抠:1-shot 单图模板,完成后自动指派给该 element。
 */
export async function POST(_req: NextRequest, { params }: RouteParams): Promise<Response> {
  try {
    const { id: elementId } = await params
    if (!isValidId(elementId))
      return jsonResponse({ error: 'invalid id' }, { status: 400 })

    // 找 element 所属 page → state → project
    // elements 是按 page 整文件存的,需要扫描所有 page。MVP 简化:接受额外 query ?page_id 参数(更高效),否则扫描
    const url = new URL(_req.url)
    const pageId = url.searchParams.get('page_id')
    if (!pageId) {
      return jsonResponse(
        { error: 'page_id query param required' },
        { status: 400 },
      )
    }
    if (!isValidId(pageId))
      return jsonResponse({ error: 'invalid page_id' }, { status: 400 })

    const elements = await getElementsForPage(pageId)
    const element = elements.find((e) => e.id === elementId)
    if (!element) return jsonResponse({ error: 'element not found' }, { status: 404 })

    const page = await getPage(pageId)
    if (!page) return jsonResponse({ error: 'page not found' }, { status: 404 })
    const project = await getProject(page.project_id)
    if (!project) return jsonResponse({ error: 'project not found' }, { status: 404 })
    const stateId = element.state_ids[0] ?? page.canonical_state_id
    if (!stateId)
      return jsonResponse({ error: 'no state' }, { status: 412 })
    const state = await getState(stateId)
    if (!state) return jsonResponse({ error: 'state not found' }, { status: 404 })

    if (isStateLocked(stateId))
      return jsonResponse({ error: 'state busy' }, { status: 409 })

    // audit run
    const auditRun = {
      id: newId(),
      state_id: stateId,
      pass: 're_extract' as const,
      status: 'running' as const,
      started_at: nowIso(),
      llm_request: {
        provider_id: '(image_gen)',
        model: '',
        prompt: '(audit)',
        images: [paths.raw(stateId)],
        extra: { element_id: elementId },
      },
      llm_response: null,
    }
    await createPipelineRun(auditRun)

    void (async () => {
      try {
        await withStateLock(stateId, async () => {
          const result = await runReExtract({ state, page, project, element })
          // 自动指派(单切片无歧义,Phase 7 例外条款)
          const asset = await assignSliceToElement({
            elementId,
            pageId,
            source: {
              state_id: stateId,
              category: result.newSliceCategory,
              idx: result.newSliceIdx,
            },
          })
          await updatePipelineRun(auditRun.id, {
            status: 'completed',
            completed_at: nowIso(),
            parsed_result: {
              new_slice_idx: result.newSliceIdx,
              category: result.newSliceCategory,
              asset_id: asset.id,
              sub_run_id: result.subRunId,
            },
          })
        })
      } catch (err) {
        if (err instanceof StateBusyError) return
        const message = err instanceof Error ? err.message : String(err)
        console.error(`[re-extract ${auditRun.id}]`, message)
        await updatePipelineRun(auditRun.id, {
          status: 'failed',
          completed_at: nowIso(),
          error: { code: 'RE_EXTRACT_ERROR', message, retryable: true },
        }).catch(() => {})
      }
    })()

    return jsonResponse({ run_id: auditRun.id }, { status: 202 })
  } catch (err) {
    return errorToResponse(err)
  }
}
