import { NextRequest } from 'next/server'
import {
  getState,
  getPage,
  getProject,
  updateState,
} from '@/lib/projects'
import { runPass1MultiRoute } from '@/lib/pass1-runner'
import { createPipelineRun, updatePipelineRun } from '@/lib/elements'
import { getActiveProvider } from '@/lib/config'
import { withStateLock, isStateLocked, StateBusyError } from '@/lib/run-lock'
import { errorToResponse, jsonResponse } from '@/lib/api-response'
import { newId, nowIso, isValidId } from '@/lib/id'
import { paths } from '@/lib/fs-utils'

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * POST /api/states/[id]/pass1
 * Phase 4:5 路并行 + IoU 合并;< 3/5 抛 PASS1_ERROR。
 * 总 audit run(pass='pass1')+ 5 个 sub-runs。前端轮询总 run。
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
    const provider = await getActiveProvider('mllm')
    if (!provider) {
      return jsonResponse(
        { error: '未配置 active mllm provider' },
        { status: 412 },
      )
    }

    // 总 audit run(stub)
    const auditRun = {
      id: newId(),
      state_id: stateId,
      pass: 'pass1' as const,
      status: 'running' as const,
      started_at: nowIso(),
      llm_request: {
        provider_id: provider.id,
        model: provider.model ?? '',
        prompt: '(audit stub - 见 pass1_<category> sub-runs)',
        images: [paths.raw(stateId)],
        extra: {},
      },
      llm_response: null,
    }
    await createPipelineRun(auditRun)
    await updateState(stateId, {
      pipeline_status: 'pass1_running',
      pass1_run_id: auditRun.id,
    })

    void (async () => {
      try {
        await withStateLock(stateId, async () => {
          const result = await runPass1MultiRoute({
            state,
            pageName: page.name,
            ...(project.description !== undefined ? { pageDescription: project.description } : {}),
          })
          await updatePipelineRun(auditRun.id, {
            status: 'completed',
            completed_at: nowIso(),
            parsed_result: {
              successful_routes: result.successes.map((s) => ({
                category: s.category,
                count: s.elements.length,
                sub_run_id: s.subRunId,
              })),
              failed_routes: result.failures.map((f) => ({
                category: f.category,
                error: f.error,
              })),
              merged_count: result.mergedElements.length,
              filtered_tiny_count: result.filteredTiny.length,
            },
          })
        })
        await updateState(stateId, { pipeline_status: 'pass1_done' })
      } catch (err) {
        if (err instanceof StateBusyError) return
        const message = err instanceof Error ? err.message : String(err)
        console.error(`[pass1 audit ${auditRun.id}]`, message)
        await updatePipelineRun(auditRun.id, {
          status: 'failed',
          completed_at: nowIso(),
          error: { code: 'PASS1_ERROR', message, retryable: true },
        }).catch(() => {})
        await updateState(stateId, { pipeline_status: 'pass1_failed' }).catch(() => {})
      }
    })()

    return jsonResponse({ run_id: auditRun.id }, { status: 202 })
  } catch (err) {
    return errorToResponse(err)
  }
}
