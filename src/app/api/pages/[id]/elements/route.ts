import { NextRequest, NextResponse } from 'next/server'

import { getPage } from '@/lib/pages'
import { getElementsByPage, saveElementsForPage } from '@/lib/elements'
import type { Element } from '@/lib/types'

type RouteCtx = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, ctx: RouteCtx) {
  const { id } = await ctx.params
  const page = await getPage(id)
  if (!page) return NextResponse.json({ error: 'page not found' }, { status: 404 })
  const elements = await getElementsByPage(id)
  return NextResponse.json(elements)
}

export async function PUT(req: NextRequest, ctx: RouteCtx) {
  const { id: pageId } = await ctx.params
  const page = await getPage(pageId)
  if (!page) return NextResponse.json({ error: 'page not found' }, { status: 404 })

  const body = (await req.json().catch(() => null)) as Element[] | null
  if (!Array.isArray(body)) {
    return NextResponse.json({ error: 'body 必须是 Element[]' }, { status: 400 })
  }

  // 校验
  const errors: string[] = []
  for (let i = 0; i < body.length; i++) {
    const el = body[i]
    if (!el || typeof el !== 'object') {
      errors.push(`#${i}: 非对象`)
      continue
    }
    if (typeof el.id !== 'string' || !el.id) errors.push(`#${i}: id 必填`)
    if (typeof el.name !== 'string' || !el.name.trim()) errors.push(`#${i}(${el.id}): name 必填`)
    if (el.type !== 'static' && el.type !== 'code') errors.push(`#${i}(${el.id}): type 必须是 static/code`)
    if (!Array.isArray(el.bbox) || el.bbox.length !== 4) {
      errors.push(`#${i}(${el.id}): bbox 必须 [x,y,w,h]`)
    } else {
      for (let j = 0; j < 4; j++) {
        const v = el.bbox[j]
        if (typeof v !== 'number' || v < 0 || v > 1) {
          errors.push(`#${i}(${el.id}): bbox[${j}]=${v} 必须 ∈ [0,1]`)
        }
      }
    }
    if (!Array.isArray(el.state_ids)) errors.push(`#${i}(${el.id}): state_ids 必须 array`)
  }
  if (errors.length > 0) {
    return NextResponse.json({ error: 'invalid Element[]', details: errors }, { status: 400 })
  }

  // 强制 page_id 锁定
  const cleaned = body.map((el) => ({ ...el, page_id: pageId, updated_at: new Date().toISOString() }))
  await saveElementsForPage(pageId, cleaned)
  return NextResponse.json(cleaned)
}
