import { NextRequest } from 'next/server'
import { assignSliceToElement } from '@/lib/slices'
import { getElementsForPage } from '@/lib/elements'
import { errorToResponse, jsonResponse } from '@/lib/api-response'
import { isValidId } from '@/lib/id'
import { ALL_VISUAL_CATEGORIES } from '@/lib/visual-category'
import type { VisualCategory } from '@/lib/types'

interface RouteParams {
  params: Promise<{ id: string }>
}

/** POST /api/elements/[id]/assign-slice  body { state_id, category, idx, page_id } */
export async function POST(req: NextRequest, { params }: RouteParams): Promise<Response> {
  try {
    const { id: elementId } = await params
    if (!isValidId(elementId))
      return jsonResponse({ error: 'invalid id' }, { status: 400 })
    const body = (await req.json()) as {
      state_id?: string
      category?: string
      idx?: number
      page_id?: string
    }
    const { state_id, category, idx, page_id } = body
    if (!state_id || !isValidId(state_id))
      return jsonResponse({ error: 'state_id required' }, { status: 400 })
    if (!page_id || !isValidId(page_id))
      return jsonResponse({ error: 'page_id required' }, { status: 400 })
    if (!category || !ALL_VISUAL_CATEGORIES.includes(category as VisualCategory))
      return jsonResponse({ error: 'invalid category' }, { status: 400 })
    if (!Number.isInteger(idx) || (idx as number) < 0)
      return jsonResponse({ error: 'invalid idx' }, { status: 400 })

    // verify element exists in page
    const elements = await getElementsForPage(page_id)
    const el = elements.find((e) => e.id === elementId)
    if (!el) return jsonResponse({ error: 'element not found in page' }, { status: 404 })

    const asset = await assignSliceToElement({
      elementId,
      pageId: page_id,
      source: { state_id, category: category as VisualCategory, idx: idx as number },
    })
    return jsonResponse({ asset })
  } catch (err) {
    return errorToResponse(err)
  }
}
