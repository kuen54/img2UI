import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'node:fs'
import { paths } from '@/lib/fs-utils'
import { isValidId } from '@/lib/id'
import { ALL_VISUAL_CATEGORIES } from '@/lib/visual-category'
import type { VisualCategory } from '@/lib/types'

interface RouteParams {
  params: Promise<{ id: string; category: string }>
}

/** GET Pass 2 输出的 per-category 透明 PNG(`data/keyed/{state}-{cat}.png`)。
 *  Pass 2 只对元素数 ≥ 1 的 category 写文件,缺失返回 404 是正常情况。 */
export async function GET(_req: NextRequest, { params }: RouteParams): Promise<Response> {
  const { id, category } = await params
  if (!isValidId(id))
    return NextResponse.json({ error: 'invalid id' }, { status: 400 })
  if (!ALL_VISUAL_CATEGORIES.includes(category as VisualCategory))
    return NextResponse.json({ error: 'invalid category' }, { status: 400 })

  try {
    const buf = await fs.readFile(paths.keyed(id, category as VisualCategory))
    return new NextResponse(buf, {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'private, max-age=3600',
      },
    })
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return NextResponse.json({ error: 'not found' }, { status: 404 })
    }
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}
