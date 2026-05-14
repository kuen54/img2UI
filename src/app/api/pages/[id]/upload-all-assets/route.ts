import { NextRequest, NextResponse } from 'next/server'

import { getPage } from '@/lib/pages'
import { getProject } from '@/lib/projects'
import { listAssetsByPage, readAssetBinary, patchAsset } from '@/lib/assets'
import { loadConfig } from '@/lib/config'
import { uploadAssetsBatch, type BatchUploadItem } from '@/lib/cdn-client'

type RouteCtx = { params: Promise<{ id: string }> }

export async function POST(_req: NextRequest, ctx: RouteCtx) {
  const { id: pageId } = await ctx.params
  const page = await getPage(pageId)
  if (!page) return NextResponse.json({ error: 'page not found' }, { status: 404 })

  const project = await getProject(page.project_id)
  if (!project) return NextResponse.json({ error: 'project not found' }, { status: 404 })

  const config = await loadConfig()
  const provider =
    config.providers.find((p) => p.id === project.cdn_provider_id && p.kind === 'cdn') ??
    config.providers.find((p) => p.kind === 'cdn' && p.active)
  if (!provider) {
    return NextResponse.json(
      { error: '未配置 active 的 cdn provider(去 /settings/cdn 设置)' },
      { status: 400 },
    )
  }

  const allAssets = await listAssetsByPage(pageId)
  // 已上传的跳过(`status === 'uploaded'`)
  const pending = allAssets.filter((a) => a.status !== 'uploaded')
  if (pending.length === 0) {
    return NextResponse.json({ uploaded: [], failed: [], skipped: allAssets.length })
  }

  // 读 binary
  const items: BatchUploadItem[] = []
  const missing: { id: string; error: string }[] = []
  for (const a of pending) {
    const body = await readAssetBinary(a.id)
    if (!body) {
      missing.push({ id: a.id, error: 'asset 二进制不存在' })
      continue
    }
    items.push({ assetId: a.id, body })
  }

  const result = await uploadAssetsBatch(provider, project.id, page.id, items)

  // 写盘:成功的 patch cdn_url + status='uploaded'
  for (const u of result.uploaded) {
    await patchAsset(u.id, { cdn_url: u.cdn_url, status: 'uploaded' })
  }

  return NextResponse.json({
    uploaded: result.uploaded.map((u) => u.id),
    failed: [...result.failed, ...missing],
  })
}
