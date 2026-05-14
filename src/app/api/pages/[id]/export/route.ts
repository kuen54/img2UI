import { NextRequest, NextResponse } from 'next/server'
import path from 'node:path'

import { loadExportPayload, writeExportFolder, streamExportZip } from '@/lib/exporter'

type RouteCtx = { params: Promise<{ id: string }> }

type ExportBody = {
  format: 'folder' | 'zip'
  output_dir?: string
}

export async function POST(req: NextRequest, ctx: RouteCtx) {
  const { id: pageId } = await ctx.params

  let body: ExportBody
  try {
    body = (await req.json()) as ExportBody
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 })
  }

  if (body.format !== 'folder' && body.format !== 'zip') {
    return NextResponse.json(
      { error: 'format must be "folder" or "zip"' },
      { status: 400 },
    )
  }

  let payload
  try {
    payload = await loadExportPayload(pageId)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 404 })
  }

  if (body.format === 'folder') {
    if (!body.output_dir) {
      return NextResponse.json(
        { error: 'output_dir 必填(format=folder)' },
        { status: 400 },
      )
    }
    if (!path.isAbsolute(body.output_dir)) {
      return NextResponse.json({ error: 'output_dir 必须是绝对路径' }, { status: 400 })
    }
    try {
      const result = await writeExportFolder(payload, body.output_dir)
      return NextResponse.json(result)
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 500 })
    }
  }

  // zip
  const { stream, filename } = streamExportZip(payload)
  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
    },
  })
}
