import { NextRequest, NextResponse } from 'next/server'

import { getAsset, readAssetBinary, deleteAsset, patchAsset } from '@/lib/assets'
import type { AssetStatus } from '@/lib/types'

type RouteCtx = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, ctx: RouteCtx) {
  const { id } = await ctx.params
  const asset = await getAsset(id)
  if (!asset) return NextResponse.json({ error: 'asset not found' }, { status: 404 })
  return NextResponse.json(asset)
}

const ALLOWED_STATUSES: ReadonlySet<AssetStatus> = new Set([
  'extracted',
  'validated',
  'uploaded',
  'failed',
])

export async function PATCH(req: NextRequest, ctx: RouteCtx) {
  const { id } = await ctx.params
  const body = (await req.json().catch(() => null)) as { status?: AssetStatus } | null
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 })
  }
  if (body.status !== undefined && !ALLOWED_STATUSES.has(body.status)) {
    return NextResponse.json({ error: `invalid status: ${body.status}` }, { status: 400 })
  }
  const next = await patchAsset(id, body.status !== undefined ? { status: body.status } : {})
  if (!next) return NextResponse.json({ error: 'asset not found' }, { status: 404 })
  return NextResponse.json(next)
}

export async function DELETE(_req: NextRequest, ctx: RouteCtx) {
  const { id } = await ctx.params
  await deleteAsset(id)
  return new NextResponse(null, { status: 204 })
}

export const _readAssetBinary = readAssetBinary
