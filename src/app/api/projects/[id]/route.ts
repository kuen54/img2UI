import { NextRequest } from 'next/server'
import { getProject, updateProject, deleteProject } from '@/lib/projects'
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
    const project = await getProject(id)
    if (!project) return jsonResponse({ error: 'not found' }, { status: 404 })
    return jsonResponse(project)
  } catch (err) {
    return errorToResponse(err)
  }
}

export async function PUT(req: NextRequest, { params }: RouteParams): Promise<Response> {
  try {
    const { id } = await params
    if (!isValidId(id)) return jsonResponse({ error: 'invalid id' }, { status: 400 })
    const patch = (await req.json()) as Record<string, unknown>
    const updated = await updateProject(id, patch)
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
    // 同 DELETE /api/pages:任一页面流程运行中(后台 job 持锁)都不允许删,
    // 防止 job 完成时在已删设计稿上重建产物成孤儿文件。
    // 互斥已下沉到 lib(deleteState 的 withStateLock),持锁时抛 StateBusyError
    try {
      await deleteProject(id)
    } catch (err) {
      if (err instanceof StateBusyError) {
        return jsonResponse(
          { error: '项目下有页面流程进行中,无法删除,请等待当前流程完成' },
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
