import { NextRequest } from 'next/server'
import { unassignAsset } from '@/lib/slices'
import { errorToResponse, jsonResponse } from '@/lib/api-response'
import { isValidId } from '@/lib/id'
import { getAsset } from '@/lib/assets'
import { listAssetsForPage } from '@/lib/assets'

interface RouteParams {
  params: Promise<{ id: string }>
}

/** GET /api/elements/[id]/asset?page_id=... → 当前 asset(若已指派) */
export async function GET(req: NextRequest, { params }: RouteParams): Promise<Response> {
  try {
    const { id } = await params
    if (!isValidId(id)) return jsonResponse({ error: 'invalid id' }, { status: 400 })
    const asset = await getAsset(id)
    if (!asset) return jsonResponse({ asset: null })
    return jsonResponse({ asset })
  } catch (err) {
    return errorToResponse(err)
  }
}

/** DELETE 撤销指派 */
export async function DELETE(_req: NextRequest, { params }: RouteParams): Promise<Response> {
  try {
    const { id } = await params
    if (!isValidId(id)) return jsonResponse({ error: 'invalid id' }, { status: 400 })
    await unassignAsset(id)
    return new Response(null, { status: 204 })
  } catch (err) {
    return errorToResponse(err)
  }
}

// 让 listAssetsForPage 不被 unused-import 警告(API 用 ?page_id 拓展时可能用到)
void listAssetsForPage
