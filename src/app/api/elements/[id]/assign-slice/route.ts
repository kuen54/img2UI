import { NextRequest, NextResponse } from 'next/server'

import { assignSliceToElement } from '@/lib/slices'

export const runtime = 'nodejs'

const ID_RE = /^[a-zA-Z0-9_-]{1,32}$/
const VALID_CATEGORIES = ['subject', 'button', 'container', 'background', 'decoration', 'other'] as const

type RouteCtx = { params: Promise<{ id: string }> }

// POST /api/elements/[id]/assign-slice
// body: { state_id, category, slice_idx, page_id }
export async function POST(req: NextRequest, ctx: RouteCtx) {
  const { id } = await ctx.params
  if (!ID_RE.test(id)) return new NextResponse('invalid element id', { status: 400 })

  let body: unknown
  try { body = await req.json() } catch { return new NextResponse('invalid body', { status: 400 }) }

  const b = body as { state_id?: unknown; category?: unknown; slice_idx?: unknown; page_id?: unknown }
  if (
    typeof b.state_id !== 'string' || !ID_RE.test(b.state_id) ||
    typeof b.category !== 'string' || !(VALID_CATEGORIES as readonly string[]).includes(b.category) ||
    typeof b.slice_idx !== 'number' || !Number.isInteger(b.slice_idx) || b.slice_idx < 0 ||
    typeof b.page_id !== 'string' || !ID_RE.test(b.page_id)
  ) {
    return new NextResponse('invalid body fields', { status: 400 })
  }

  try {
    await assignSliceToElement(b.state_id, b.category, b.slice_idx, id, { page_id: b.page_id })
  } catch (e) {
    return new NextResponse((e as Error).message, { status: 404 })
  }
  return NextResponse.json({ ok: true, element_id: id, slice_idx: b.slice_idx })
}
