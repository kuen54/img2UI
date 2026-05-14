import { NextRequest, NextResponse } from 'next/server'

import { getPage } from '@/lib/pages'
import { listAssetsByPage } from '@/lib/assets'

type RouteCtx = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, ctx: RouteCtx) {
  const { id } = await ctx.params
  const page = await getPage(id)
  if (!page) return NextResponse.json({ error: 'page not found' }, { status: 404 })
  const assets = await listAssetsByPage(id)
  return NextResponse.json(assets)
}
