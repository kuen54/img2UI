import { NextRequest } from 'next/server'
import { getElementsForPage, saveElementsForPage } from '@/lib/elements'
import { deleteAssetsNotIn } from '@/lib/assets'
import { invalidatePageStats } from '@/lib/page-stats'
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
    // 删元素后清理孤儿 asset(连带 assets-bin PNG),否则旧记录永久残留污染 export。
    // 口径按 element id 清理:type 从 static 翻成 code 的元素其 id 仍在 cleaned 里,asset 保留
    //(用户把 type 翻回 static 不丢已有指派)。仅当 element 被整体删除时其 asset 才被清。
    await deleteAssetsNotIn(id, new Set(cleaned.map((e) => e.id)))
    // 整批替换会改 type / 增删元素,直接影响 stats 口径(assigned_static_elements 等),
    // 与 assign/unassign 同理需失效缓存;lib 层加会 elements↔page-stats 成环,故放路由层
    invalidatePageStats(id)
    return jsonResponse({ elements: cleaned })
  } catch (err) {
    return errorToResponse(err)
  }
}
