import { NextRequest, NextResponse } from 'next/server'

import { runPass2 } from '@/lib/pass2-runner'

export const runtime = 'nodejs'
export const maxDuration = 300

type RouteCtx = { params: Promise<{ id: string }> }

// fire-and-forget:立即 202 返回,Pass 2 在后台跑(setPipelineStatus 在 runner 里维护状态)
// 失败时 runner 会标 pass2_failed,前端 2s 轮询能感知
export async function POST(_req: NextRequest, ctx: RouteCtx) {
  const { id: stateId } = await ctx.params
  void runPass2(stateId).catch((e) => {
    console.error(`[pass2 background] state=${stateId}:`, (e as Error).message)
  })
  return NextResponse.json({ status: 'accepted' }, { status: 202 })
}
