import { NextRequest } from 'next/server'
import path from 'node:path'
import os from 'node:os'
import { errorToResponse, jsonResponse } from '@/lib/api-response'
import { isValidId } from '@/lib/id'
import { getPage } from '@/lib/projects'
import { exportPageToFolder } from '@/lib/exporter'
import { getActiveProvider } from '@/lib/config'

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * POST /api/pages/[id]/export
 * Body { output_dir?: string }
 * 写文件到 output_dir/{project-name}/pages/{page-name}/...,返回 path。
 */
export async function POST(req: NextRequest, { params }: RouteParams): Promise<Response> {
  try {
    const { id: pageId } = await params
    if (!isValidId(pageId))
      return jsonResponse({ error: 'invalid id' }, { status: 400 })
    const page = await getPage(pageId)
    if (!page) return jsonResponse({ error: 'page not found' }, { status: 404 })

    const body = (await req.json().catch(() => ({}))) as { output_dir?: string }
    const outputDir = body.output_dir
      ? expandHome(body.output_dir)
      : path.join(os.homedir(), 'img2ui-out')

    const cdn = await getActiveProvider('cdn')
    const cdnBase = cdn?.public_url_prefix ?? undefined

    const summary = await exportPageToFolder({
      outputDir,
      projectId: page.project_id,
      pageId,
      ...(cdnBase ? { assetCdnBase: cdnBase } : {}),
    })

    return jsonResponse({
      ok: true,
      path: outputDir,
      missing_assets: summary.missing_assets,
      orphan_assets_skipped: summary.orphan_assets_skipped,
    })
  } catch (err) {
    return errorToResponse(err)
  }
}

function expandHome(p: string): string {
  if (p.startsWith('~/') || p === '~') {
    return path.join(os.homedir(), p.slice(1))
  }
  return p
}
