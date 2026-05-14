import { NextRequest, NextResponse } from 'next/server'

import { readSlice } from '@/lib/slices'

export const runtime = 'nodejs'

const ID_RE = /^[a-zA-Z0-9_-]{1,32}$/
const VALID_CATEGORIES = ['subject', 'button', 'container', 'background', 'decoration', 'other'] as const
const IDX_RE = /^\d{1,4}$/

type RouteCtx = { params: Promise<{ stateId: string; category: string; idx: string }> }

// GET /api/slices/[stateId]/[category]/[idx] — 返回切片 PNG binary
export async function GET(_req: NextRequest, ctx: RouteCtx) {
  const { stateId, category, idx } = await ctx.params
  if (!ID_RE.test(stateId)) return new NextResponse('invalid state id', { status: 400 })
  if (!(VALID_CATEGORIES as readonly string[]).includes(category)) return new NextResponse('invalid category', { status: 400 })
  if (!IDX_RE.test(idx)) return new NextResponse('invalid idx', { status: 400 })

  const buffer = await readSlice(stateId, category, Number(idx))
  if (!buffer) return new NextResponse('not found', { status: 404 })
  return new NextResponse(buffer as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=86400',
    },
  })
}
