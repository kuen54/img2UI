import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'node:fs'
import path from 'node:path'

import { DATA_ROOT } from '@/lib/fs-utils'

type RouteCtx = { params: Promise<{ id: string }> }

// GET /api/states/[id]/pass2-raw → 直接返回 Pass 2 输出的绿幕原 PNG(留底,debug 用)
export async function GET(_req: NextRequest, ctx: RouteCtx) {
  const { id } = await ctx.params
  try {
    const buffer = await fs.readFile(path.join(DATA_ROOT, 'pass2', `${id}.png`))
    return new NextResponse(buffer as unknown as BodyInit, {
      status: 200,
      headers: { 'Content-Type': 'image/png', 'Cache-Control': 'no-cache' },
    })
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
      return new NextResponse('Pass 2 raw not found', { status: 404 })
    }
    throw e
  }
}
