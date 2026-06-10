import { NextRequest } from 'next/server'
import { promises as fs } from 'node:fs'
import { getState } from '@/lib/projects'
import { withStateLock, isStateLocked, StateBusyError } from '@/lib/run-lock'
import { errorToResponse, jsonResponse } from '@/lib/api-response'
import { isValidId } from '@/lib/id'
import { writeAtomic, listPass2Batches } from '@/lib/fs-utils'
import { ALL_VISUAL_CATEGORIES } from '@/lib/visual-category'
import { callMatting } from '@/lib/matting-client'
import { sliceAssets } from '@/lib/slicer'
import { writeSlice, nextSliceIdx } from '@/lib/slices'
import { getActiveProvider } from '@/lib/config'
import type { VisualCategory } from '@/lib/types'

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * POST /api/states/[id]/re-key-via-api
 * 复用 data/pass2/{state}-{cat}[-batchN].png 绿幕底片(不重发 image_gen),
 * 逐 category 的每个 batch 调 koukoutu → 覆写 keyed → 重切片
 * (用 nextSliceIdx 追加,旧切片保留)。
 *
 * 部分失败容忍:某 category 某 batch 失败 → 保留该 batch 旧 chroma key 结果。
 */
export async function POST(_req: NextRequest, { params }: RouteParams): Promise<Response> {
  try {
    const { id: stateId } = await params
    if (!isValidId(stateId)) return jsonResponse({ error: 'invalid id' }, { status: 400 })
    const state = await getState(stateId)
    if (!state) return jsonResponse({ error: 'state not found' }, { status: 404 })
    if (isStateLocked(stateId)) return jsonResponse({ error: 'state busy' }, { status: 409 })

    const provider = await getActiveProvider('matting')
    if (!provider) {
      return jsonResponse({ error: '未配置 active matting provider' }, { status: 412 })
    }

    return await withStateLock(stateId, async () => {
      const refreshed: VisualCategory[] = []
      const failed: Array<{ category: VisualCategory; error: string }> = []

      for (const cat of ALL_VISUAL_CATEGORIES) {
        const batches = await listPass2Batches(stateId, cat)
        if (batches.length === 0) continue // 该 category 没有绿幕底片 — 跳过
        let anyBatchSuccess = false
        for (const b of batches) {
          let buf: Buffer
          try {
            buf = await fs.readFile(b.pass2Path)
          } catch {
            continue
          }
          try {
            const transparent = await callMatting(provider, { png: buf })
            await writeAtomic(b.keyedPath, transparent)
            const slices = await sliceAssets(transparent)
            for (const s of slices) {
              const idx = await nextSliceIdx(stateId, cat)
              await writeSlice(stateId, cat, idx, s.buffer, {
                opaque_pct: s.opaque_pct,
                bbox: s.bbox,
              })
            }
            anyBatchSuccess = true
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err)
            console.warn(
              `[re-key-via-api] ${cat} batch${b.batchIdx} failed: ${message}`,
            )
            failed.push({ category: cat, error: `batch${b.batchIdx}: ${message}` })
          }
        }
        if (anyBatchSuccess) refreshed.push(cat)
      }

      if (refreshed.length === 0 && failed.length > 0) {
        return jsonResponse(
          {
            error: '抠图 API 全失败',
            failed,
          },
          { status: 502 },
        )
      }

      // failed 带 batch 级错误明细(前端展示具体原因,不只是 category 名)
      return jsonResponse({ refreshed, failed })
    })
  } catch (err) {
    if (err instanceof StateBusyError) {
      return jsonResponse({ error: 'state busy' }, { status: 409 })
    }
    return errorToResponse(err)
  }
}
