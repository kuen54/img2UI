import { NextRequest } from 'next/server'
import { getState, deleteState, getPage, updatePage } from '@/lib/projects'
import { invalidatePageStats } from '@/lib/page-stats'
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
    const state = await getState(id)
    if (!state) return jsonResponse({ error: 'not found' }, { status: 404 })
    return jsonResponse(state)
  } catch (err) {
    return errorToResponse(err)
  }
}

export async function DELETE(_req: NextRequest, { params }: RouteParams): Promise<Response> {
  try {
    const { id } = await params
    if (!isValidId(id)) return jsonResponse({ error: 'invalid id' }, { status: 400 })
    const state = await getState(id)
    if (!state) return new Response(null, { status: 204 }) // idempotent
    // 先删 state(deleteState 内部 withStateLock 真互斥):流程运行中会抛
    // StateBusyError → 409,且此时 page 尚未被改动,不留半套副作用
    try {
      await deleteState(id)
    } catch (err) {
      if (err instanceof StateBusyError) {
        return jsonResponse(
          { error: '流程进行中,无法删除设计稿,请等待当前流程完成' },
          { status: 409 },
        )
      }
      throw err
    }
    // 顺手清 page.canonical_state_id(若指向本 state)
    const page = await getPage(state.page_id)
    if (page?.canonical_state_id === id) {
      await updatePage(state.page_id, { canonical_state_id: '' })
    }
    // 删 state 改 state_count / pipeline_status 等口径,失效缓存(lib 层会成环,故放路由层)
    invalidatePageStats(state.page_id)
    return new Response(null, { status: 204 })
  } catch (err) {
    return errorToResponse(err)
  }
}
