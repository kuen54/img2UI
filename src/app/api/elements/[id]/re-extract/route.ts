import { NextRequest, NextResponse } from 'next/server'

import { runPass2 } from '@/lib/pass2-runner'
import { getElementsByPage } from '@/lib/elements'

export const runtime = 'nodejs'
export const maxDuration = 300

type RouteCtx = { params: Promise<{ id: string }> }

// 单元素重抠:找到该 element 所属 page 的 canonical state,跑 runPass2 with onlyElementId
export async function POST(_req: NextRequest, ctx: RouteCtx) {
  const { id: elementId } = await ctx.params

  // 通过 elements 找到 page_id 进而找到 canonical state(扫所有 pages — 元素 id 不能精确反查 page)
  // Phase 5 简单实现:扫已知 elements 文件 → 找含此 id 的 page
  const fs = await import('node:fs/promises')
  const path = await import('node:path')
  const { DATA_ROOT } = await import('@/lib/fs-utils')

  let foundPageId: string | null = null
  try {
    const files = await fs.readdir(path.join(DATA_ROOT, 'elements'))
    for (const f of files) {
      if (!f.endsWith('.json')) continue
      const pageId = f.replace(/\.json$/, '')
      const els = await getElementsByPage(pageId)
      if (els.some((e) => e.id === elementId)) {
        foundPageId = pageId
        break
      }
    }
  } catch {
    /* ignore */
  }
  if (!foundPageId) return NextResponse.json({ error: 'element not found' }, { status: 404 })

  // 通过 page 找 canonical state
  const { getPage } = await import('@/lib/pages')
  const page = await getPage(foundPageId)
  if (!page?.canonical_state_id) {
    return NextResponse.json({ error: 'page 没有 canonical state,无法重抠' }, { status: 400 })
  }

  try {
    const result = await runPass2(page.canonical_state_id, { onlyElementId: elementId })
    return NextResponse.json({ run_id: result.run_id }, { status: 202 })
  } catch (e) {
    const msg = (e as Error).message
    const status = msg.includes('not found') ? 404 : msg.includes('稍候再试') ? 409 : 500
    return NextResponse.json({ error: msg }, { status })
  }
}
