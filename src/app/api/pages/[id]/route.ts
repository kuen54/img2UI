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
    await deletePage(id)
    return new Response(null, { status: 204 })
  } catch (err) {
    return errorToResponse(err)
  }
}
