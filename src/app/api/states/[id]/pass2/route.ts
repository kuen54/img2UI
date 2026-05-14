import { NextRequest, NextResponse } from 'next/server'

import { runPass2 } from '@/lib/pass2-runner'

export const runtime = 'nodejs'
export const maxDuration = 300

type RouteCtx = { params: Promise<{ id: string }> }

export async function POST(_req: NextRequest, ctx: RouteCtx) {
  const { id: stateId } = await ctx.params
  try {
    const result = await runPass2(stateId)
    return NextResponse.json({ run_id: result.run_id, created_assets: result.created_assets }, { status: 202 })
  } catch (e) {
    const msg = (e as Error).message
    const status = msg.includes('not found') ? 404 : msg.includes('稍候再试') ? 409 : 500
    return NextResponse.json({ error: msg }, { status })
  }
}
