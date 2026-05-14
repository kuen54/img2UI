import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'node:fs'
import path from 'node:path'

import { DATA_ROOT } from '@/lib/fs-utils'
import { getState } from '@/lib/states'
import { listMultiRouteFiles, stackPngsVertical } from '@/lib/multi-png-stack'

type RouteCtx = { params: Promise<{ id: string }> }

// GET /api/states/[id]/keyed → chroma key 后透明 PNG。v0.2 multi-route 起,
// 按 visual_category 分文件 keyed/{id}-{category}.png,这里纵向 stack 合并;
// 兼容老数据单文件 keyed/{id}.png。
export async function GET(_req: NextRequest, ctx: RouteCtx) {
  const { id } = await ctx.params
  const state = await getState(id)
  if (!state) return new NextResponse('state not found', { status: 404 })

  const dir = path.join(DATA_ROOT, 'keyed')

  try {
    const buffer = await fs.readFile(path.join(dir, `${id}.png`))
    return pngResponse(buffer)
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e
  }

  const files = await listMultiRouteFiles(dir, id)
  if (files.length === 0) {
    return new NextResponse('keyed image not found(尚未跑过 Pass 2)', { status: 404 })
  }
  const merged = await stackPngsVertical(files)
  return pngResponse(merged)
}

function pngResponse(buffer: Buffer): NextResponse {
  return new NextResponse(buffer as unknown as BodyInit, {
    status: 200,
    headers: { 'Content-Type': 'image/png', 'Cache-Control': 'no-cache' },
  })
}
