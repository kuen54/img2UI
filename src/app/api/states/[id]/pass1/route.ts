import { NextRequest } from 'next/server'
import { getState, getPage, getProject } from '@/lib/projects'
import { runPass1MultiRoute } from '@/lib/pass1-runner'
import { getElementsForPage } from '@/lib/elements'
import { getActiveProvider } from '@/lib/config'
import { StateBusyError } from '@/lib/run-lock'
import { beginAuditJob } from '@/lib/audit-job'
import { errorToResponse, jsonResponse } from '@/lib/api-response'
import { newId, nowIso, isValidId } from '@/lib/id'
import { paths } from '@/lib/fs-utils'
import type { PipelineRun } from '@/lib/types'

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * POST /api/states/[id]/pass1
 * Phase 4:5 路并行 + IoU 合并;< 3/5 抛 PASS1_ERROR。
 * 总 audit run(pass='pass1')+ 5 个 sub-runs。前端轮询总 run。
 *
 * 重跑保护:page 已有 elements(可能含人工标注 / 已指派 asset)时返回 409
 * ELEMENTS_EXIST,需要 body `{"force": true}` 显式确认 —— 重跑会整批替换
 * elements 并清理失去引用的 Asset(见 pass1-runner)。
 */
export async function POST(req: NextRequest, { params }: RouteParams): Promise<Response> {
  try {
    const { id: stateId } = await params
    if (!isValidId(stateId))
      return jsonResponse({ error: 'invalid id' }, { status: 400 })

    const state = await getState(stateId)
    if (!state) return jsonResponse({ error: 'state not found' }, { status: 404 })

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

    const body = (await req.json().catch(() => null)) as { force?: boolean } | null
    const existing = await getElementsForPage(state.page_id)
    if (existing.length > 0 && body?.force !== true) {
      return jsonResponse(
        {
          error:
            '该页面已有 elements(可能含人工标注)。重跑 Pass 1 会完全替换它们并清理已指派的 asset。',
          code: 'ELEMENTS_EXIST',
          element_count: existing.length,
        },
        { status: 409 },
      )
    }

    // 总 audit run(stub)
    const auditRun: PipelineRun = {
      id: newId(),
      state_id: stateId,
      pass: 'pass1',
      status: 'running',
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

    try {
      await beginAuditJob({
        stateId,
        auditRun,
        runningPatch: { pipeline_status: 'pass1_running', pass1_run_id: auditRun.id },
        doneStatus: 'pass1_done',
        failStatus: 'pass1_failed',
        errorCode: 'PASS1_ERROR',
        job: async () => {
          const result = await runPass1MultiRoute({
            state,
            pageName: page.name,
            ...(project.description !== undefined ? { pageDescription: project.description } : {}),
          })
          return {
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
