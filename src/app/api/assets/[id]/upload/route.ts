import { NextRequest } from 'next/server'
import { promises as fs } from 'node:fs'
import { getAsset, saveAsset, listAssetsForPage } from '@/lib/assets'
import { getPage, getState } from '@/lib/projects'
import { uploadAssetToCdn } from '@/lib/cdn-client'
import { getActiveProvider } from '@/lib/config'
import { invalidatePageStats } from '@/lib/page-stats'
import { errorToResponse, jsonResponse } from '@/lib/api-response'
import { isValidId, nowIso } from '@/lib/id'
import { paths } from '@/lib/fs-utils'
import type { Asset } from '@/lib/types'

interface RouteParams {
  params: Promise<{ id: string }>
}

async function uploadOne(asset: Asset, projectId: string): Promise<Asset> {
  const provider = await getActiveProvider('cdn')
  if (!provider) throw new Error('未配置 active cdn provider')
  const buf = await fs.readFile(paths.assetBin(asset.id))
  const key = `${projectId}/${asset.page_id}/${asset.id}.png`
  const cdnUrl = await uploadAssetToCdn(provider, key, buf, 'image/png')
  const updated: Asset = {
    ...asset,
    cdn_url: cdnUrl,
    status: 'uploaded',
    updated_at: nowIso(),
  }
  await saveAsset(updated)
  return updated
}

/** POST /api/assets/[id]/upload — 单个 asset 上 CDN */
export async function POST(_req: NextRequest, { params }: RouteParams): Promise<Response> {
  try {
    const { id } = await params
    if (!isValidId(id)) return jsonResponse({ error: 'invalid id' }, { status: 400 })
    const asset = await getAsset(id)
    if (!asset) return jsonResponse({ error: 'asset not found' }, { status: 404 })

    // 找 project_id(asset.page_id → page.project_id)
    const page = await getPage(asset.page_id)
    if (!page) return jsonResponse({ error: 'page not found' }, { status: 404 })
    const updated = await uploadOne(asset, page.project_id)
    // status 翻成 uploaded 影响 stats 口径,失效缓存(lib 层会成环,故放路由层)
    invalidatePageStats(asset.page_id)
    return jsonResponse(updated)
  } catch (err) {
    return errorToResponse(err)
  }
}

void getState
void listAssetsForPage
