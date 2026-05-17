import { NextRequest } from 'next/server'
import { promises as fs } from 'node:fs'
import { getPage } from '@/lib/projects'
import { listAssetsForPage, saveAsset } from '@/lib/assets'
import { uploadAssetToCdn } from '@/lib/cdn-client'
import { getActiveProvider } from '@/lib/config'
import { errorToResponse, jsonResponse } from '@/lib/api-response'
import { isValidId, nowIso } from '@/lib/id'
import { paths } from '@/lib/fs-utils'
import type { Asset } from '@/lib/types'

interface RouteParams {
  params: Promise<{ id: string }>
}

/** POST /api/pages/[id]/upload-all-assets — 整页 asset 批量上 CDN */
export async function POST(_req: NextRequest, { params }: RouteParams): Promise<Response> {
  try {
    const { id: pageId } = await params
    if (!isValidId(pageId)) return jsonResponse({ error: 'invalid id' }, { status: 400 })
    const page = await getPage(pageId)
    if (!page) return jsonResponse({ error: 'page not found' }, { status: 404 })

    const provider = await getActiveProvider('cdn')
    if (!provider) {
      return jsonResponse({ error: '未配置 active cdn provider' }, { status: 412 })
    }

    const assets = await listAssetsForPage(pageId)
    let uploaded = 0
    const failed: string[] = []
    for (const a of assets) {
      try {
        const buf = await fs.readFile(paths.assetBin(a.id))
        const key = `${page.project_id}/${pageId}/${a.id}.png`
        const cdnUrl = await uploadAssetToCdn(provider, key, buf, 'image/png')
        const updated: Asset = {
          ...a,
          cdn_url: cdnUrl,
          status: 'uploaded',
          updated_at: nowIso(),
        }
        await saveAsset(updated)
        uploaded++
      } catch (err) {
        console.warn(`[upload-all-assets] ${a.id} failed:`, err)
        failed.push(a.id)
      }
    }
    return jsonResponse({ uploaded, failed })
  } catch (err) {
    return errorToResponse(err)
  }
}
