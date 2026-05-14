import { NextRequest, NextResponse } from 'next/server'

import { getAsset, readAssetBinary, deleteAsset } from '@/lib/assets'

type RouteCtx = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, ctx: RouteCtx) {
  const { id } = await ctx.params
  const asset = await getAsset(id)
  if (!asset) return NextResponse.json({ error: 'asset not found' }, { status: 404 })
  return NextResponse.json(asset)
}

export async function DELETE(_req: NextRequest, ctx: RouteCtx) {
  const { id } = await ctx.params
  await deleteAsset(id)
  return new NextResponse(null, { status: 204 })
}

// /api/assets/[id]/raw 之前需要单独路由,Phase 5 简单做法:复用此路由 query ?raw=1
// 但 Next.js 不允许同 segment 多 method,改放到 /api/assets/[id]/raw/route.ts 独立文件
export const _readAssetBinary = readAssetBinary
