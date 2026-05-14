import { NextRequest, NextResponse } from 'next/server'

import { reKeyViaApi } from '@/lib/pass2-runner'

export const runtime = 'nodejs'
export const maxDuration = 300

type RouteCtx = { params: Promise<{ id: string }> }

// 用户手动触发的 API 抠图(Asset Review 「用 API 抠图」按钮)
// 见 CLAUDE.md § 7:默认 pipeline 仍是绿幕 + chroma key,这条仅用作手动 fallback
export async function POST(_req: NextRequest, ctx: RouteCtx) {
  const { id } = await ctx.params
  try {
    const result = await reKeyViaApi(id)
    return NextResponse.json(result, { status: 200 })
  } catch (e) {
    const msg = (e as Error).message
    const status = msg.includes('not found') ? 404
      : msg.includes('稍候再试') ? 409
      : msg.includes('未配置 active matting provider') ? 400
      : msg.includes('pass2 raw 不存在') ? 400
      : 500
    return NextResponse.json({ error: msg }, { status })
  }
}
