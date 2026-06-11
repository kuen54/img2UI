import { NextRequest } from 'next/server'
import { subCropSlice } from '@/lib/slices'
import { isStateLocked } from '@/lib/run-lock'
import { errorToResponse, jsonResponse } from '@/lib/api-response'
import { isValidId } from '@/lib/id'
import { ALL_VISUAL_CATEGORIES } from '@/lib/visual-category'
import type { VisualCategory } from '@/lib/types'

interface RouteParams {
  params: Promise<{ id: string; category: string; idx: string }>
}

/**
 * POST /api/states/[id]/slices/[category]/[idx]/sub-crop
 * Body { rects: Array<{ x, y, w, h }> }(像素坐标,相对原切片图)
 * 返回新切片(追加到该 category,原切片保留)
 */
export async function POST(req: NextRequest, { params }: RouteParams): Promise<Response> {
  try {
    const { id, category, idx } = await params
    if (!isValidId(id))
      return jsonResponse({ error: 'invalid id' }, { status: 400 })
    if (!ALL_VISUAL_CATEGORIES.includes(category as VisualCategory))
      return jsonResponse({ error: 'invalid category' }, { status: 400 })
    const idxNum = parseInt(idx, 10)
    if (!Number.isInteger(idxNum) || idxNum < 0)
      return jsonResponse({ error: 'invalid idx' }, { status: 400 })
    // 撞 idx 由 slices:{state}:{cat} 队列锁防住(re-key / re-extract 的
    // 写切片段与 sub-crop 共用);这里的入口检查只是避免用户在 pipeline
    // 运行中对着中间态切片下刀
    if (isStateLocked(id)) return jsonResponse({ error: 'state busy' }, { status: 409 })

    const body = (await req.json()) as {
      rects?: Array<{ x: number; y: number; w: number; h: number }>
    }
    const rects = body.rects ?? []
    if (rects.length === 0)
      return jsonResponse({ error: 'rects required' }, { status: 400 })
    for (const r of rects) {
      if (
        !Number.isFinite(r.x) ||
        !Number.isFinite(r.y) ||
        !Number.isFinite(r.w) ||
        !Number.isFinite(r.h)
      )
        return jsonResponse({ error: 'invalid rect' }, { status: 400 })
    }

    const created = await subCropSlice(id, category as VisualCategory, idxNum, rects)
    return jsonResponse({ created })
  } catch (err) {
    return errorToResponse(err)
  }
}
