import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'node:fs'
import { paths } from '@/lib/fs-utils'
import { isValidId } from '@/lib/id'
import { ALL_VISUAL_CATEGORIES } from '@/lib/visual-category'
import type { VisualCategory } from '@/lib/types'

interface RouteParams {
  params: Promise<{ id: string; category: string }>
}

/** GET Pass 2 输出的 per-category 透明 PNG(`data/keyed/{state}-{cat}[-batchN].png`)。
 *  默认返回 batch 0(无 batch 后缀的旧文件)。
 *  支持 `?batch=N` 查询特定 batch(N≥1)。
 *  Pass 2 只对元素数 ≥ 1 的 category 写文件,缺失返回 404 是正常情况。 */
export async function GET(req: NextRequest, { params }: RouteParams): Promise<Response> {
  const { id, category } = await params
  if (!isValidId(id))
    return NextResponse.json({ error: 'invalid id' }, { status: 400 })
  if (!ALL_VISUAL_CATEGORIES.includes(category as VisualCategory))
    return NextResponse.json({ error: 'invalid category' }, { status: 400 })

  const batchParam = req.nextUrl.searchParams.get('batch')
  const batchIdx = batchParam ? parseInt(batchParam, 10) : 0
  if (Number.isNaN(batchIdx) || batchIdx < 0)
    return NextResponse.json({ error: 'invalid batch' }, { status: 400 })

  try {
    const buf = await fs.readFile(
      paths.keyed(id, category as VisualCategory, batchIdx),
    )
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
