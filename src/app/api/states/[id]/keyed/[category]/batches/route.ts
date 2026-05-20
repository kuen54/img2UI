import { NextRequest, NextResponse } from 'next/server'
import { listPass2Batches } from '@/lib/fs-utils'
import { isValidId } from '@/lib/id'
import { ALL_VISUAL_CATEGORIES } from '@/lib/visual-category'
import type { VisualCategory } from '@/lib/types'

interface RouteParams {
  params: Promise<{ id: string; category: string }>
}

/** GET 返回该 (state, category) 对应所有 keyed batch 的 idx 列表(升序)。
 *  - 单 batch(<=15 元素):返回 [0]
 *  - 多 batch:返回 [0, 1, ...]
 *  - 该 category 没跑过 Pass 2:返回 [] */
export async function GET(_req: NextRequest, { params }: RouteParams): Promise<Response> {
  const { id, category } = await params
  if (!isValidId(id))
    return NextResponse.json({ error: 'invalid id' }, { status: 400 })
  if (!ALL_VISUAL_CATEGORIES.includes(category as VisualCategory))
    return NextResponse.json({ error: 'invalid category' }, { status: 400 })

  const batches = await listPass2Batches(id, category as VisualCategory)
  return NextResponse.json({ batches: batches.map((b) => b.batchIdx) })
}
