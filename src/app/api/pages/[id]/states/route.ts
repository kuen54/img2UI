import { NextRequest, NextResponse } from 'next/server'

import { getPage, updatePage } from '@/lib/pages'
import { listStatesByPage, createState, writeStateRawImage } from '@/lib/states'
import { readImageDimensions, isPng } from '@/lib/image-meta'
import { acquireLock, releaseLock, RunLockConflictError } from '@/lib/run-lock'
import type { State } from '@/lib/types'

export const runtime = 'nodejs'
export const maxDuration = 60

type RouteCtx = { params: Promise<{ id: string }> }

type UploadMeta = {
  states: Array<{ filename: string; name: string; is_canonical: boolean }>
}

export async function GET(_req: NextRequest, ctx: RouteCtx) {
  const { id } = await ctx.params
  const page = await getPage(id)
  if (!page) return NextResponse.json({ error: 'page not found' }, { status: 404 })
  const states = await listStatesByPage(id)
  return NextResponse.json(states)
}

export async function POST(req: NextRequest, ctx: RouteCtx) {
  const { id: pageId } = await ctx.params
  const page = await getPage(pageId)
  if (!page) return NextResponse.json({ error: 'page not found' }, { status: 404 })

  const lockKey = `page:${pageId}:upload`
  try {
    acquireLock(lockKey, `upload-${Date.now()}`)
  } catch (e) {
    if (e instanceof RunLockConflictError) {
      return NextResponse.json({ error: '该页面正在上传中,请稍候' }, { status: 409 })
    }
    throw e
  }

  try {
    const form = await req.formData()
    const files = form.getAll('files').filter((v): v is File => v instanceof File)
    const metaRaw = form.get('meta')
    if (typeof metaRaw !== 'string') {
      return NextResponse.json({ error: 'meta 字段缺失' }, { status: 400 })
    }
    let meta: UploadMeta
    try {
      meta = JSON.parse(metaRaw) as UploadMeta
    } catch {
      return NextResponse.json({ error: 'meta 不是合法 JSON' }, { status: 400 })
    }
    if (!Array.isArray(meta.states) || meta.states.length !== files.length) {
      return NextResponse.json(
        { error: `meta.states.length(${meta.states?.length ?? 0})不匹配 files.length(${files.length})` },
        { status: 400 },
      )
    }

    const created: State[] = []
    const errors: Array<{ filename: string; error: string }> = []
    let canonicalAssigned: string | null = null

    for (let i = 0; i < files.length; i++) {
      const file = files[i]!
      const stateMeta = meta.states[i]!
      try {
        const buffer = Buffer.from(await file.arrayBuffer())
        if (!isPng(buffer)) {
          errors.push({ filename: stateMeta.filename, error: '不是 PNG 文件(magic bytes 校验失败)' })
          continue
        }
        const dims = await readImageDimensions(buffer)
        const state = await createState({
          page_id: pageId,
          name: stateMeta.name,
          width: dims.width,
          height: dims.height,
        })
        await writeStateRawImage(state.id, buffer)
        created.push(state)
        if (stateMeta.is_canonical && !canonicalAssigned) {
          canonicalAssigned = state.id
        }
      } catch (e) {
        errors.push({ filename: stateMeta.filename, error: (e as Error).message })
      }
    }

    // 设 canonical(只在 page 当前为空 + 用户标了 is_canonical 时才覆盖)
    if (canonicalAssigned && !page.canonical_state_id) {
      await updatePage(pageId, { canonical_state_id: canonicalAssigned })
    }

    return NextResponse.json({ created, errors }, { status: 201 })
  } finally {
    releaseLock(lockKey)
  }
}
