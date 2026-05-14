import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'node:fs'
import path from 'node:path'

import { DATA_ROOT } from '@/lib/fs-utils'
import { getState } from '@/lib/states'

type RouteCtx = { params: Promise<{ id: string }> }

// GET /api/states/[id]/keyed → 直接返回 chroma key 后的透明 PNG
export async function GET(_req: NextRequest, ctx: RouteCtx) {
  const { id } = await ctx.params
  const state = await getState(id)
  if (!state) return new NextResponse('state not found', { status: 404 })

  try {
    const buffer = await fs.readFile(path.join(DATA_ROOT, 'keyed', `${id}.png`))
    return new NextResponse(buffer as unknown as BodyInit, {
      status: 200,
      headers: { 'Content-Type': 'image/png', 'Cache-Control': 'no-cache' },
    })
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
      return new NextResponse('keyed image not found(尚未跑过 Pass 2)', { status: 404 })
    }
    throw e
  }
}
