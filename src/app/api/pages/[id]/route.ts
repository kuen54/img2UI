import { NextRequest } from 'next/server'
import {
  getPage,
  updatePage,
  deletePage,
  listStatesByPage,
} from '@/lib/projects'
import { getPageStats } from '@/lib/page-stats'
import { errorToResponse, jsonResponse } from '@/lib/api-response'
import { isValidId } from '@/lib/id'
import { StateBusyError } from '@/lib/run-lock'

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function GET(_req: NextRequest, { params }: RouteParams): Promise<Response> {
  try {
    const { id } = await params
    if (!isValidId(id)) return jsonResponse({ error: 'invalid id' }, { status: 400 })
    const page = await getPage(id)
    if (!page) return jsonResponse({ error: 'not found' }, { status: 404 })
    const states = await listStatesByPage(id)
    const canonicalStateId = page.canonical_state_id || states[0]?.id || null
    const stats = await getPageStats(id, canonicalStateId)
    return jsonResponse({ ...page, states, stats })
  } catch (err) {
    return errorToResponse(err)
  }
}

export async function PUT(req: NextRequest, { params }: RouteParams): Promise<Response> {
  try {
    const { id } = await params
    if (!isValidId(id)) return jsonResponse({ error: 'invalid id' }, { status: 400 })
    const patch = (await req.json()) as Record<string, unknown>
    const updated = await updatePage(id, patch)
    if (!updated) return jsonResponse({ error: 'not found' }, { status: 404 })
    return jsonResponse(updated)
  } catch (err) {
    return errorToResponse(err)
  }
}

export async function DELETE(_req: NextRequest, { params }: RouteParams): Promise<Response> {
  try {
    const { id } = await params
    if (!isValidId(id)) return jsonResponse({ error: 'invalid id' }, { status: 400 })
    // 流程运行中(后台 job 持锁)不允许删:否则 job 完成时 writeSlice / createPipelineRun
    // 会在已删的设计稿上重建目录、落盘产物,变成永久孤儿文件。
    // 互斥已下沉到 lib(deleteState 的 withStateLock),持锁时抛 StateBusyError
    try {
      await deletePage(id)
    } catch (err) {
      if (err instanceof StateBusyError) {
        return jsonResponse(
          { error: '流程进行中,无法删除页面,请等待当前流程完成' },
          { status: 409 },
        )
      }
      throw err
    }
    return new Response(null, { status: 204 })
  } catch (err) {
    return errorToResponse(err)
  }
}
