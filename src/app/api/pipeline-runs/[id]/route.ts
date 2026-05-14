import { NextRequest, NextResponse } from 'next/server'

import { getRun } from '@/lib/pipelines'

type RouteCtx = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, ctx: RouteCtx) {
  const { id } = await ctx.params
  const run = await getRun(id)
  if (!run) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json(run)
}
