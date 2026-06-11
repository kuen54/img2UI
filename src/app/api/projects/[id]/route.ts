import { NextRequest } from 'next/server'
import {
  getProject,
  updateProject,
  deleteProject,
  listPagesByProject,
  listStatesByPage,
} from '@/lib/projects'
import { errorToResponse, jsonResponse } from '@/lib/api-response'
import { isValidId } from '@/lib/id'
import { isStateLocked } from '@/lib/run-lock'

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
    // 防止 job 完成时在已删设计稿上重建产物成孤儿文件
    const pages = await listPagesByProject(id)
    for (const p of pages) {
      const states = await listStatesByPage(p.id)
      if (states.some((s) => isStateLocked(s.id))) {
        return jsonResponse(
          { error: '项目下有页面流程进行中,无法删除,请等待当前流程完成' },
          { status: 409 },
        )
      }
    }
    await deleteProject(id)
    return new Response(null, { status: 204 })
  } catch (err) {
    return errorToResponse(err)
  }
}
