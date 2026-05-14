import { NextRequest, NextResponse } from 'next/server'

import { listSlices } from '@/lib/slices'

export const runtime = 'nodejs'

const ID_RE = /^[a-zA-Z0-9_-]{1,32}$/
const VALID_CATEGORIES = ['subject', 'button', 'container', 'background', 'decoration', 'other'] as const

type RouteCtx = { params: Promise<{ id: string }> }

// GET /api/states/[id]/slices?category=X — 返回 SliceManifest JSON
export async function GET(req: NextRequest, ctx: RouteCtx) {
  const { id } = await ctx.params
  if (!id || !ID_RE.test(id)) {
    return new NextResponse('invalid state id', { status: 400 })
  }
  const category = req.nextUrl.searchParams.get('category')
  if (!category || !(VALID_CATEGORIES as readonly string[]).includes(category)) {
    return new NextResponse('invalid category', { status: 400 })
  }
  const manifest = await listSlices(id, category)
  if (!manifest) return new NextResponse('not found', { status: 404 })
  return NextResponse.json(manifest)
}
