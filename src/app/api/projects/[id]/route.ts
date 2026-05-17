import { NextRequest } from 'next/server'
import {
  getProject,
  updateProject,
  deleteProject,
} from '@/lib/projects'
import { errorToResponse, jsonResponse } from '@/lib/api-response'
import { isValidId } from '@/lib/id'

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
    await deleteProject(id)
    return new Response(null, { status: 204 })
  } catch (err) {
    return errorToResponse(err)
  }
}
