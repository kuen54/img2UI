import { NextRequest } from 'next/server'
import {
  getPage,
  updatePage,
  listStatesByPage,
  createState,
} from '@/lib/projects'
import { generateThumbnail, getImageDimensions } from '@/lib/thumbnails'
import { errorToResponse, jsonResponse } from '@/lib/api-response'
import { isValidId } from '@/lib/id'

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function POST(req: NextRequest, { params }: RouteParams): Promise<Response> {
  try {
    const { id: pageId } = await params
    if (!isValidId(pageId))
      return jsonResponse({ error: 'invalid id' }, { status: 400 })

    const page = await getPage(pageId)
    if (!page) return jsonResponse({ error: 'page not found' }, { status: 404 })

    // MVP S1:每 page 只允许 1 个 state。已有 state 时拒,前端走 DELETE + POST 流程
    const existing = await listStatesByPage(pageId)
    if (existing.length > 0) {
      return jsonResponse(
        {
          error: 'page already has a state',
          message: '该页面已有上传图,请先删除再重新上传',
          existing_state_id: existing[0]!.id,
        },
        { status: 409 },
      )
    }

    const form = await req.formData()
    const file = form.get('file')
    if (!(file instanceof File)) {
      return jsonResponse({ error: 'file required' }, { status: 400 })
    }
    if (!file.type.includes('png') && !file.name.toLowerCase().endsWith('.png')) {
      return jsonResponse({ error: 'PNG only' }, { status: 400 })
    }

    const buf = Buffer.from(await file.arrayBuffer())
    const { width, height } = await getImageDimensions(buf)

    const state = await createState({
      page_id: pageId,
      name: 'canonical',
      imageBuffer: buf,
      width,
      height,
    })

    // 缩略图失败不阻断(HANDOFF §4.2)
    try {
      await generateThumbnail(buf, state.id)
    } catch (err) {
      console.error('[states POST] thumbnail gen failed', err)
    }

    // 更新 page.canonical_state_id
    await updatePage(pageId, { canonical_state_id: state.id })

    return jsonResponse(state, { status: 201 })
  } catch (err) {
    return errorToResponse(err)
  }
}
