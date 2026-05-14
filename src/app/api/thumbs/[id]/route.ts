import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'node:fs'

import { thumbnailPathFor } from '@/lib/thumbnails'

export const runtime = 'nodejs'

type RouteCtx = { params: Promise<{ id: string }> }

// nanoid 字符集 + page_ 前缀,严格限制防 path-traversal
const ID_RE = /^[a-zA-Z0-9_-]{1,32}$/

// GET /api/thumbs/[id] → 返回 data/thumbs/{id}.png(Phase 8e)
export async function GET(_req: NextRequest, ctx: RouteCtx) {
  const { id } = await ctx.params
  if (!id || !ID_RE.test(id)) {
    return new NextResponse('invalid thumbnail id', { status: 400 })
  }

  try {
    const buffer = await fs.readFile(thumbnailPathFor(id))
    return new NextResponse(buffer as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=86400',
      },
    })
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
      return new NextResponse('thumbnail not found', { status: 404 })
    }
    throw e
  }
}
