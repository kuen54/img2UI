import { NextRequest, NextResponse } from 'next/server'

import { runPass1 } from '@/lib/pass1-runner'

export const runtime = 'nodejs'
export const maxDuration = 180  // Pass 1 真实跑可能 ~50s,留余量

type RouteCtx = { params: Promise<{ id: string }> }

// fire-and-forget:立即 202 返回,Pass 1 在后台跑(setPipelineStatus 在 runner 里维护状态)
// 失败时 runner 会标 pass1_failed,前端 2s 轮询能感知
export async function POST(_req: NextRequest, ctx: RouteCtx) {
  const { id: stateId } = await ctx.params
  // 不 await:让 dialog/前端立即关闭,UI 立刻显示「布局分析中」
  void runPass1(stateId).catch((e) => {
    console.error(`[pass1 background] state=${stateId}:`, (e as Error).message)
  })
  return NextResponse.json({ status: 'accepted' }, { status: 202 })
}
