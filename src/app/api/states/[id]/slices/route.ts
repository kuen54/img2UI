import { NextRequest } from 'next/server'
import { listSlicesWithAssignment } from '@/lib/slices'
import { getState } from '@/lib/projects'
import { errorToResponse, jsonResponse } from '@/lib/api-response'
import { isValidId } from '@/lib/id'

interface RouteParams {
  params: Promise<{ id: string }>
}

/** GET /api/states/[id]/slices?page_id=... → 切片库 + assigned_to */
export async function GET(req: NextRequest, { params }: RouteParams): Promise<Response> {
  try {
    const { id: stateId } = await params
    if (!isValidId(stateId))
      return jsonResponse({ error: 'invalid id' }, { status: 400 })
    const state = await getState(stateId)
    if (!state) return jsonResponse({ error: 'state not found' }, { status: 404 })

    const url = new URL(req.url)
    const pageId = url.searchParams.get('page_id') ?? state.page_id
    if (!isValidId(pageId))
      return jsonResponse({ error: 'invalid page_id' }, { status: 400 })

    const slices = await listSlicesWithAssignment(pageId, stateId)
    return jsonResponse({ slices })
  } catch (err) {
    return errorToResponse(err)
  }
}
