import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'node:fs'
import path from 'node:path'

import { getState } from '@/lib/states'
import { DATA_ROOT } from '@/lib/fs-utils'

type RouteCtx = { params: Promise<{ id: string }> }

// GET /api/states/[id]/raw → 直接返回 raw PNG bytes(用于 <img> / Next.js Image src)

export async function GET(_req: NextRequest, ctx: RouteCtx) {
  const { id } = await ctx.params
  const state = await getState(id)
  if (!state) return new NextResponse('not found', { status: 404 })

  try {
    const buffer = await fs.readFile(path.join(DATA_ROOT, 'raw', `${id}.png`))
    return new NextResponse(buffer as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'no-cache',
      },
    })
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
      return new NextResponse('raw image not found', { status: 404 })
    }
    throw e
  }
}
