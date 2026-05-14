import { NextRequest, NextResponse } from 'next/server'

import { getAsset, readAssetBinary, patchAsset } from '@/lib/assets'
import { getPage } from '@/lib/pages'
import { getProject } from '@/lib/projects'
import { loadConfig } from '@/lib/config'
import { uploadAsset } from '@/lib/cdn-client'

type RouteCtx = { params: Promise<{ id: string }> }

export async function POST(_req: NextRequest, ctx: RouteCtx) {
  const { id } = await ctx.params
  const asset = await getAsset(id)
  if (!asset) return NextResponse.json({ error: 'asset not found' }, { status: 404 })

  const page = await getPage(asset.page_id)
  if (!page) return NextResponse.json({ error: 'page not found' }, { status: 404 })

  const project = await getProject(page.project_id)
  if (!project) return NextResponse.json({ error: 'project not found' }, { status: 404 })

  const config = await loadConfig()
  // project 优先指定 cdn provider;否则取 active cdn
  const provider =
    config.providers.find((p) => p.id === project.cdn_provider_id && p.kind === 'cdn') ??
    config.providers.find((p) => p.kind === 'cdn' && p.active)
  if (!provider) {
    return NextResponse.json(
      { error: '未配置 active 的 cdn provider(去 /settings/cdn 设置)' },
      { status: 400 },
    )
  }

  const body = await readAssetBinary(asset.id)
  if (!body) {
    return NextResponse.json({ error: 'asset 二进制不存在' }, { status: 404 })
  }

  try {
    const { cdn_url } = await uploadAsset(provider, {
      body,
      projectId: project.id,
      pageId: page.id,
      assetId: asset.id,
    })
    const updated = await patchAsset(asset.id, { cdn_url, status: 'uploaded' })
    return NextResponse.json(updated)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
