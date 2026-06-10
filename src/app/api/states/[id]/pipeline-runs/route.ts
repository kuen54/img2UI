import { NextRequest } from 'next/server'
import { listPipelineRunsByState } from '@/lib/elements'
import { errorToResponse, jsonResponse } from '@/lib/api-response'
import { isValidId } from '@/lib/id'

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * 该 state 的所有 PipelineRun 瘦身列表(只含进度展示需要的字段)。
 * 供 PipelinePanel 运行中显示「n/m 路完成」:llm_request/llm_response
 * 可能含整图 base64,绝不能整体返回。
 */
export async function GET(
  _req: NextRequest,
  { params }: RouteParams,
): Promise<Response> {
  try {
    const { id } = await params
    if (!isValidId(id)) return jsonResponse({ error: 'invalid id' }, { status: 400 })
    const runs = await listPipelineRunsByState(id)
    return jsonResponse({
      runs: runs.map((r) => ({
        id: r.id,
        pass: r.pass,
        status: r.status,
        started_at: r.started_at,
        ...(r.completed_at ? { completed_at: r.completed_at } : {}),
      })),
    })
  } catch (err) {
    return errorToResponse(err)
  }
}
