import { NextRequest } from 'next/server'
import { listPipelineRunsByState } from '@/lib/elements'
import { errorToResponse, jsonResponse } from '@/lib/api-response'
import { isValidId } from '@/lib/id'

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * 该 state 的所有 PipelineRun 瘦身列表(只含进度展示需要的字段)。
 * 供 PipelinePanel 运行中显示每路状态矩阵:llm_request/llm_response
 * 可能含整图 base64,绝不能整体返回——只挑安全的标量出来。
 *
 * 额外字段(都可选):
 * - batch_idx / total_batches / element_count:Pass 2 batch 切块坐标(llm_request.extra)
 * - slice_count:Pass 2 batch 完成后产出的切片数(parsed_result)
 * - result_count:Pass 1 路完成后保留的元素数(parsed_result.elements.length)
 * - error_message:失败原因(matrix 上 tooltip 展示)
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
      runs: runs.map((r) => {
        const extra: Record<string, unknown> = r.llm_request?.extra ?? {}
        const parsed = (r.parsed_result ?? {}) as Record<string, unknown>
        return {
          id: r.id,
          pass: r.pass,
          status: r.status,
          started_at: r.started_at,
          ...(r.completed_at ? { completed_at: r.completed_at } : {}),
          ...(typeof extra['batch_idx'] === 'number'
            ? { batch_idx: extra['batch_idx'] }
            : {}),
          ...(typeof extra['total_batches'] === 'number'
            ? { total_batches: extra['total_batches'] }
            : {}),
          ...(typeof extra['element_count'] === 'number'
            ? { element_count: extra['element_count'] }
            : {}),
          ...(typeof parsed['slice_count'] === 'number'
            ? { slice_count: parsed['slice_count'] }
            : {}),
          ...(Array.isArray(parsed['elements'])
            ? { result_count: parsed['elements'].length }
            : {}),
          ...(r.error ? { error_message: r.error.message } : {}),
        }
      }),
    })
  } catch (err) {
    return errorToResponse(err)
  }
}
