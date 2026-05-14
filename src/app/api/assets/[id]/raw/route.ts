import { NextRequest, NextResponse } from 'next/server'

import { readAssetBinary } from '@/lib/assets'

type RouteCtx = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, ctx: RouteCtx) {
  const { id } = await ctx.params
  const buffer = await readAssetBinary(id)
  if (!buffer) return new NextResponse('asset binary not found', { status: 404 })
  return new NextResponse(buffer as unknown as BodyInit, {
    status: 200,
    headers: { 'Content-Type': 'image/png', 'Cache-Control': 'no-cache' },
  })
}
