import { NextRequest, NextResponse } from 'next/server'

import { getState, setPipelineStatus } from '@/lib/states'
import { getElementsByPage, saveElementsForPage } from '@/lib/elements'
import { createRun, completeRun } from '@/lib/pipelines'
import { acquireLock, releaseLock, RunLockConflictError } from '@/lib/run-lock'
import { newElementId } from '@/lib/id'
import type { Element } from '@/lib/types'

type RouteCtx = { params: Promise<{ id: string }> }

// =============================================================================
// Phase 3:Mock Pass 1
// 接口契约跟 Phase 4 真实 LLM 调用保持一致,Phase 4 替换 mock 内部逻辑即可
// =============================================================================

const MOCK_ELEMENTS: Array<Pick<Element, 'name' | 'type' | 'bbox' | 'z_index' | 'description'>> = [
  {
    name: '卡通娃娃',
    type: 'static',
    bbox: [0.2, 0.05, 0.6, 0.35],
    z_index: 10,
    description: '蓬松云朵头发的小娃娃,蓝色羽绒服,棕色靴子(mock 占位)',
  },
  {
    name: 'SUPER 徽章',
    type: 'static',
    bbox: [0.7, 0.02, 0.25, 0.1],
    z_index: 11,
    description: '粉黄椭圆 + 虚线 + 星星(mock 占位)',
  },
  {
    name: '粉色异形容器',
    type: 'code',
    bbox: [0.05, 0.45, 0.9, 0.4],
    z_index: 1,
    description: '圆角矩形,顶部 notch,渐变粉色(mock 占位)',
  },
  {
    name: '标题文字',
    type: 'code',
    bbox: [0.1, 0.85, 0.8, 0.08],
    z_index: 5,
    description: '黑色标题文本(mock 占位)',
  },
]

export async function POST(_req: NextRequest, ctx: RouteCtx) {
  const { id: stateId } = await ctx.params
  const state = await getState(stateId)
  if (!state) return NextResponse.json({ error: 'state not found' }, { status: 404 })

  const lockKey = `state:${stateId}`
  try {
    acquireLock(lockKey, `mock-pass1-${Date.now()}`)
  } catch (e) {
    if (e instanceof RunLockConflictError) {
      return NextResponse.json({ error: '该状态正在跑 pipeline,稍候再试' }, { status: 409 })
    }
    throw e
  }

  try {
    // 1. 创建 PipelineRun
    const run = await createRun({
      state_id: stateId,
      pass: 'pass1',
      llm_request: {
        provider_id: 'mock',
        model: 'mock',
        prompt: '[Phase 3 mock — Phase 4 替换为真实 prompt]',
        images: [state.original_image_path],
        extra: {},
      },
    })

    await setPipelineStatus(stateId, 'pass1_running', { pass1_run_id: run.id })

    // 2. 合并已有 Element[](来自其他 state 的 pass1)
    const now = new Date().toISOString()
    const existing = await getElementsByPage(state.page_id)
    const merged: Element[] = [...existing]

    for (const mock of MOCK_ELEMENTS) {
      const found = merged.find((el) => el.name === mock.name)
      if (found) {
        if (!found.state_ids.includes(stateId)) {
          found.state_ids = [...found.state_ids, stateId]
          found.updated_at = now
        }
      } else {
        merged.push({
          id: newElementId(),
          page_id: state.page_id,
          state_ids: [stateId],
          name: mock.name,
          type: mock.type,
          bbox: mock.bbox,
          z_index: mock.z_index,
          description: mock.description,
          reviewed: false,
          created_at: now,
          updated_at: now,
        })
      }
    }

    await saveElementsForPage(state.page_id, merged)

    // 3. 收尾
    await setPipelineStatus(stateId, 'pass1_done')
    await completeRun(run.id, {
      parsed_result: { mock: true, element_count: merged.length },
    })

    return NextResponse.json({ run_id: run.id }, { status: 202 })
  } finally {
    releaseLock(lockKey)
  }
}
