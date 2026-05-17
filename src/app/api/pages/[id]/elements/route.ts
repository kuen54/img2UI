import { NextRequest } from 'next/server'
import { getElementsForPage, saveElementsForPage } from '@/lib/elements'
import { getPage } from '@/lib/projects'
import { errorToResponse, jsonResponse } from '@/lib/api-response'
import { isValidId, nowIso } from '@/lib/id'
import type { LayoutElement } from '@/lib/types'

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function GET(_req: NextRequest, { params }: RouteParams): Promise<Response> {
  try {
    const { id } = await params
    if (!isValidId(id)) return jsonResponse({ error: 'invalid id' }, { status: 400 })
    const page = await getPage(id)
    if (!page) return jsonResponse({ error: 'page not found' }, { status: 404 })
    const elements = await getElementsForPage(id)
    return jsonResponse({ elements })
  } catch (err) {
    return errorToResponse(err)
  }
}

/**
 * PUT 整批替换(HANDOFF §11.3)。
 * Body:{ elements: LayoutElement[] }
 */
export async function PUT(req: NextRequest, { params }: RouteParams): Promise<Response> {
  try {
    const { id } = await params
    if (!isValidId(id)) return jsonResponse({ error: 'invalid id' }, { status: 400 })
    const page = await getPage(id)
    if (!page) return jsonResponse({ error: 'page not found' }, { status: 404 })

    const body = (await req.json()) as { elements?: LayoutElement[] }
    const incoming = body.elements
    if (!Array.isArray(incoming)) {
      return jsonResponse({ error: 'elements array required' }, { status: 400 })
    }
    // 保 page_id 一致 + 更新 updated_at
    const now = nowIso()
    const cleaned = incoming.map<LayoutElement>((el) => ({
      ...el,
      page_id: id,
      updated_at: now,
    }))
    await saveElementsForPage(id, cleaned)
    return jsonResponse({ elements: cleaned })
  } catch (err) {
    return errorToResponse(err)
  }
}
