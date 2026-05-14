import { NextRequest, NextResponse } from 'next/server'

import { getState, deleteState } from '@/lib/states'
import { getPage, updatePage } from '@/lib/pages'

type RouteCtx = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, ctx: RouteCtx) {
  const { id } = await ctx.params
  const state = await getState(id)
  if (!state) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json(state)
}

export async function DELETE(_req: NextRequest, ctx: RouteCtx) {
  const { id } = await ctx.params
  const state = await getState(id)
  if (state) {
    // 如果是该 page 的 canonical,清空那个字段
    const page = await getPage(state.page_id)
    if (page && page.canonical_state_id === id) {
      await updatePage(page.id, { canonical_state_id: '' })
    }
  }
  await deleteState(id)
  return new NextResponse(null, { status: 204 })
}
