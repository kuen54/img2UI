import { NextRequest, NextResponse } from 'next/server'

import { getPage, updatePage, deletePage } from '@/lib/pages'
import { listStatesByPage, deleteStatesByPage } from '@/lib/states'
import { deleteElementsForPage } from '@/lib/elements'
import type { Page } from '@/lib/types'

type RouteCtx = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, ctx: RouteCtx) {
  const { id } = await ctx.params
  const page = await getPage(id)
  if (!page) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json(page)
}

export async function PUT(req: NextRequest, ctx: RouteCtx) {
  const { id } = await ctx.params
  const patch = (await req.json().catch(() => null)) as Partial<Page> | null
  if (!patch) return NextResponse.json({ error: 'invalid body' }, { status: 400 })
  const updated = await updatePage(id, patch)
  if (!updated) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json(updated)
}

// 级联删除:page → 全部 states + raw PNG + elements 文件
export async function DELETE(_req: NextRequest, ctx: RouteCtx) {
  const { id } = await ctx.params
  const states = await listStatesByPage(id)
  if (states.length > 0) await deleteStatesByPage(id)
  await deleteElementsForPage(id)
  await deletePage(id)
  return new NextResponse(null, { status: 204 })
}
