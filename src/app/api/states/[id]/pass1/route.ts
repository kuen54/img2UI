import { NextRequest, NextResponse } from 'next/server'

import { runPass1 } from '@/lib/pass1-runner'

export const runtime = 'nodejs'
export const maxDuration = 180  // Pass 1 真实跑可能 ~50s,留余量

type RouteCtx = { params: Promise<{ id: string }> }

export async function POST(_req: NextRequest, ctx: RouteCtx) {
  const { id: stateId } = await ctx.params
  try {
    const { run_id } = await runPass1(stateId)
    return NextResponse.json({ run_id }, { status: 202 })
  } catch (e) {
    const msg = (e as Error).message
    const status = msg.includes('not found') ? 404 : msg.includes('稍候再试') ? 409 : 500
    return NextResponse.json({ error: msg }, { status })
  }
}
