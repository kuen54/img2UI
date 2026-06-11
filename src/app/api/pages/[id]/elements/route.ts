import { NextRequest } from 'next/server'
import { getElementsForPage, saveElementsForPage } from '@/lib/elements'
import { deleteAssetsNotIn } from '@/lib/assets'
import { invalidatePageStats } from '@/lib/page-stats'
import { getPage } from '@/lib/projects'
import { errorToResponse, jsonResponse } from '@/lib/api-response'
import { isValidId, nowIso } from '@/lib/id'
import { ALL_VISUAL_CATEGORIES } from '@/lib/visual-category'
import type { BBox, ElementType, LayoutElement, VisualCategory } from '@/lib/types'

interface RouteParams {
  params: Promise<{ id: string }>
}

function isElementType(v: unknown): v is ElementType {
  return v === 'static' || v === 'code'
}

function isVisualCategory(v: unknown): v is VisualCategory {
  return typeof v === 'string' && (ALL_VISUAL_CATEGORIES as readonly string[]).includes(v)
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((s) => typeof s === 'string')
}

/** bbox 必须是 4 个有限数字(归一化范围由 LLM/前端保证,这里只挡 NaN/Infinity/缺项) */
function isValidBBox(v: unknown): v is BBox {
  return (
    Array.isArray(v) &&
    v.length === 4 &&
    v.every((n) => typeof n === 'number' && Number.isFinite(n))
  )
}

/**
 * 按 LayoutElement 字段白名单重建元素,不信任客户端的展开写入:
 * - 未知字段直接丢弃(防止脏字段落盘后被 GET 永久回传)
 * - 必填字段(id / type / bbox / state_ids / name / visual_category / z_index /
 *   description / reviewed)不合法返回 null,由调用方整批 400
 * - created_at 以服务端为准:同 id 已存在则保留旧值,新 id 用本次 now
 * - page_id / updated_at 一律服务端覆盖(与改造前行为一致)
 * optional 字段(shape_spec 等)缺失合法、原样透传(undefined 跳过),
 * 保证 GET → PUT round-trip 无损。
 */
function sanitizeElement(
  raw: unknown,
  pageId: string,
  createdAtById: Map<string, string>,
  now: string,
): LayoutElement | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null
  const el = raw as Record<string, unknown>
  if (typeof el.id !== 'string' || !isValidId(el.id)) return null
  if (!isElementType(el.type)) return null
  if (!isValidBBox(el.bbox)) return null
  // 以下均为 LayoutElement 必填字段(types.ts 非 optional),缺失或类型/枚举错都拒绝
  if (!isStringArray(el.state_ids)) return null
  if (typeof el.name !== 'string') return null
  if (!isVisualCategory(el.visual_category)) return null
  if (typeof el.z_index !== 'number' || !Number.isFinite(el.z_index)) return null
  if (typeof el.description !== 'string') return null
  if (typeof el.reviewed !== 'boolean') return null
  return {
    id: el.id,
    page_id: pageId,
    state_ids: el.state_ids,
    name: el.name,
    type: el.type,
    visual_category: el.visual_category,
    bbox: el.bbox,
    z_index: el.z_index,
    description: el.description,
    ...(el.shape_spec !== undefined ? { shape_spec: el.shape_spec as string } : {}),
    ...(el.material_spec !== undefined
      ? { material_spec: el.material_spec as string }
      : {}),
    ...(el.cross_state_notes !== undefined
      ? { cross_state_notes: el.cross_state_notes as string }
      : {}),
    ...(el.pass1_routes_seen !== undefined
      ? { pass1_routes_seen: el.pass1_routes_seen as string[] }
      : {}),
    reviewed: el.reviewed,
    created_at: createdAtById.get(el.id) ?? now,
    updated_at: now,
  }
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

    const body = (await req.json()) as { elements?: unknown[] }
    const incoming = body.elements
    if (!Array.isArray(incoming)) {
      return jsonResponse({ error: 'elements array required' }, { status: 400 })
    }
    // created_at 不信任客户端:同 id 沿用磁盘旧值,新 id 才用本次 now
    const existing = await getElementsForPage(id)
    const createdAtById = new Map(existing.map((e) => [e.id, e.created_at]))
    const now = nowIso()
    const cleaned: LayoutElement[] = []
    for (let i = 0; i < incoming.length; i++) {
      const el = sanitizeElement(incoming[i], id, createdAtById, now)
      if (!el) {
        return jsonResponse(
          {
            error: `elements[${i}] 不合法:id / type / bbox / state_ids / name / visual_category / z_index / description / reviewed 校验失败,整批已拒绝`,
          },
          { status: 400 },
        )
      }
      cleaned.push(el)
    }
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
