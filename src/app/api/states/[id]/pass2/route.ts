import { NextRequest } from 'next/server'
import {
  getState,
  getPage,
  getProject,
  updateState,
} from '@/lib/projects'
import { runPass2MultiRoute } from '@/lib/pass2-runner'
import {
  createPipelineRun,
  updatePipelineRun,
  getElementsForPage,
} from '@/lib/elements'
import { withStateLock, isStateLocked, StateBusyError } from '@/lib/run-lock'
import { errorToResponse, jsonResponse } from '@/lib/api-response'
import { newId, nowIso, isValidId } from '@/lib/id'
import { paths } from '@/lib/fs-utils'

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * POST /api/states/[id]/pass2
 * 前置:state.pipeline_status === 'pass1_done' 且所有 element.reviewed === true
 */
export async function POST(_req: NextRequest, { params }: RouteParams): Promise<Response> {
  try {
    const { id: stateId } = await params
    if (!isValidId(stateId))
      return jsonResponse({ error: 'invalid id' }, { status: 400 })

    const state = await getState(stateId)
    if (!state) return jsonResponse({ error: 'state not found' }, { status: 404 })
    if (isStateLocked(stateId))
      return jsonResponse({ error: 'state busy' }, { status: 409 })

    const page = await getPage(state.page_id)
    if (!page) return jsonResponse({ error: 'page not found' }, { status: 404 })
    const project = await getProject(page.project_id)
    if (!project) return jsonResponse({ error: 'project not found' }, { status: 404 })

    if (state.pipeline_status !== 'pass1_done' && state.pipeline_status !== 'pass2_failed' && state.pipeline_status !== 'pass2_done') {
      return jsonResponse(
        { error: `state pipeline_status=${state.pipeline_status},需要 pass1_done` },
        { status: 412 },
      )
    }

    const elements = await getElementsForPage(state.page_id)
    if (elements.length === 0) {
      return jsonResponse({ error: 'no elements (run Pass 1 first)' }, { status: 412 })
    }
    const unreviewed = elements.filter((e) => !e.reviewed)
    if (unreviewed.length > 0) {
      return jsonResponse(
        {
          error: '尚有 element 未确认',
          unreviewed_count: unreviewed.length,
        },
        { status: 412 },
      )
    }

    // 总 audit run
    const auditRun = {
      id: newId(),
      state_id: stateId,
      pass: 'pass2' as const,
      status: 'running' as const,
      started_at: nowIso(),
      llm_request: {
        provider_id: '(image_gen)',
        model: '',
        prompt: '(audit stub - 见 pass2_<category> sub-runs)',
        images: [paths.raw(stateId)],
        extra: {},
      },
      llm_response: null,
    }
    await createPipelineRun(auditRun)
    await updateState(stateId, {
      pipeline_status: 'pass2_running',
      pass2_run_id: auditRun.id,
    })

    void (async () => {
      try {
        await withStateLock(stateId, async () => {
          const result = await runPass2MultiRoute({
            state,
            page,
            project,
            elements,
          })
          await updatePipelineRun(auditRun.id, {
            status: 'completed',
            completed_at: nowIso(),
            parsed_result: {
              successful_routes: result.successes,
              failed_routes: result.failures,
              total_static_count: result.totalStaticCount,
            },
          })
        })
        await updateState(stateId, { pipeline_status: 'pass2_done' })
      } catch (err) {
        if (err instanceof StateBusyError) return
        const message = err instanceof Error ? err.message : String(err)
        console.error(`[pass2 audit ${auditRun.id}]`, message)
        await updatePipelineRun(auditRun.id, {
          status: 'failed',
          completed_at: nowIso(),
          error: { code: 'PASS2_ERROR', message, retryable: true },
        }).catch(() => {})
        await updateState(stateId, { pipeline_status: 'pass2_failed' }).catch(() => {})
      }
    })()

    return jsonResponse({ run_id: auditRun.id }, { status: 202 })
  } catch (err) {
    return errorToResponse(err)
  }
}
