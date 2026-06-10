import { NextRequest } from 'next/server'
import { listAssetsForPage } from '@/lib/assets'
import { errorToResponse, jsonResponse } from '@/lib/api-response'
import { isValidId } from '@/lib/id'

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * GET /api/pages/[id]/assets — 整页 asset 一次拉。
 * Asset Review 之前是每个 element 单独 fetch /api/elements/[id]/asset(N+1)。
 */
export async function GET(_req: NextRequest, { params }: RouteParams): Promise<Response> {
  try {
    const { id: pageId } = await params
    if (!isValidId(pageId)) return jsonResponse({ error: 'invalid id' }, { status: 400 })
    const assets = await listAssetsForPage(pageId)
    return jsonResponse({ assets })
  } catch (err) {
    return errorToResponse(err)
  }
}
