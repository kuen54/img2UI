import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { promises as fs } from 'node:fs'
import path from 'node:path'

import { mergeElements, type LlmElementOut } from '@/lib/pass1-runner'
import { saveElementsForPage } from '@/lib/elements'
import type { State } from '@/lib/types'
import { DATA_ROOT } from '@/lib/fs-utils'

// 测试用唯一 pageId 避免污染其他 fixture(elements 持久化在 data/elements/{pageId}.json)
const TEST_PAGE_ID = '__test_pass1_runner_page__'
const ELEMENTS_FILE = path.join(DATA_ROOT, 'elements', `${TEST_PAGE_ID}.json`)

function makeState(overrides?: Partial<State>): State {
  return {
    id: 'state_test',
    page_id: TEST_PAGE_ID,
    name: 'canonical',
    original_image_path: 'data/raw/state_test.png',
    width: 472,
    height: 1024,
    pipeline_status: 'idle',
    created_at: '2026-05-14T00:00:00Z',
    ...overrides,
  }
}

beforeEach(async () => {
  await fs.unlink(ELEMENTS_FILE).catch(() => {})
})

afterAll(async () => {
  await fs.unlink(ELEMENTS_FILE).catch(() => {})
})

describe('mergeElements - bbox 归一化', () => {
  it('LLM 已归一化(全部 ≤ 1)→ 不重新归一化', async () => {
    const state = makeState()
    const llm: LlmElementOut[] = [
      { entity_name: 'a', type: 'static', bbox: [0.1, 0.2, 0.3, 0.4], description: '' },
    ]
    const merged = await mergeElements(state, llm)
    expect(merged[0]!.bbox).toEqual([0.1, 0.2, 0.3, 0.4])
  })

  it('LLM 输出像素坐标(任一 > 1.5)→ 整批按 width/height 归一化', async () => {
    const state = makeState({ width: 472, height: 1024 })
    const llm: LlmElementOut[] = [
      { entity_name: 'doll', type: 'static', bbox: [50, 100, 200, 400], description: '' },
      { entity_name: 'chip', type: 'static', bbox: [100, 800, 80, 60], description: '' },
    ]
    const merged = await mergeElements(state, llm)
    // 50/472 ≈ 0.106; 100/1024 ≈ 0.0977; 200/472 ≈ 0.424; 400/1024 ≈ 0.391
    expect(merged[0]!.bbox[0]).toBeCloseTo(50 / 472, 5)
    expect(merged[0]!.bbox[1]).toBeCloseTo(100 / 1024, 5)
    expect(merged[0]!.bbox[2]).toBeCloseTo(200 / 472, 5)
    expect(merged[0]!.bbox[3]).toBeCloseTo(400 / 1024, 5)
    // 第二个元素也按同一 width/height 归一化(整批)
    expect(merged[1]!.bbox[0]).toBeCloseTo(100 / 472, 5)
  })

  it('混批(部分像素部分归一化)→ 整批按像素处理(任一 > 1.5 触发)', async () => {
    const state = makeState({ width: 472, height: 1024 })
    const llm: LlmElementOut[] = [
      // 这个看起来已归一化但因为另一个元素是像素,整批被认定像素
      { entity_name: 'a', type: 'static', bbox: [0.1, 0.2, 0.3, 0.4], description: '' },
      { entity_name: 'b', type: 'static', bbox: [50, 100, 200, 400], description: '' },
    ]
    const merged = await mergeElements(state, llm)
    // a 被错误归一化(0.1/472 等),clamp01 后还在 [0,1]
    expect(merged[0]!.bbox[0]).toBeCloseTo(0.1 / 472, 5)
    // 这是已知 trade-off:启发式假设整批一致;混批是 LLM 输出错误,代码做最稳处理
  })

  it('归一化后超 1 → clamp01 夹住', async () => {
    const state = makeState({ width: 100, height: 100 })
    const llm: LlmElementOut[] = [
      { entity_name: 'overflow', type: 'static', bbox: [50, 50, 200, 200], description: '' },
    ]
    const merged = await mergeElements(state, llm)
    expect(merged[0]!.bbox).toEqual([0.5, 0.5, 1, 1])
  })

  it('已归一化但负值 → clamp01 夹到 0', async () => {
    const state = makeState()
    const llm: LlmElementOut[] = [
      { entity_name: 'neg', type: 'static', bbox: [-0.1, 0.5, 0.3, 0.4], description: '' },
    ]
    const merged = await mergeElements(state, llm)
    expect(merged[0]!.bbox[0]).toBe(0)
  })
})

describe('mergeElements - 元素插入', () => {
  it('全新元素 → push 到 merged,bbox/type/description 正确', async () => {
    const state = makeState()
    const llm: LlmElementOut[] = [
      {
        entity_name: '卡通娃娃',
        type: 'static',
        bbox: [0.1, 0.2, 0.3, 0.4],
        z_index: 5,
        description: '蓬松云朵头发的小娃娃',
      },
      {
        entity_name: '粉色异形容器',
        type: 'code',
        bbox: [0.05, 0.1, 0.9, 0.7],
        z_index: 1,
        description: '圆角矩形',
        shape_spec: 'M0,40 ...',
        material_spec: 'linear-gradient(...)',
      },
    ]
    const merged = await mergeElements(state, llm)
    expect(merged).toHaveLength(2)
    expect(merged[0]!.name).toBe('卡通娃娃')
    expect(merged[0]!.type).toBe('static')
    expect(merged[0]!.id).toMatch(/^el_/)
    expect(merged[0]!.state_ids).toEqual(['state_test'])
    expect(merged[0]!.reviewed).toBe(false)

    expect(merged[1]!.type).toBe('code')
    expect(merged[1]!.shape_spec).toBe('M0,40 ...')
    expect(merged[1]!.material_spec).toBe('linear-gradient(...)')
  })

  it('static 元素的 shape_spec/material_spec 被丢弃(SPEC § code-only)', async () => {
    const state = makeState()
    const llm: LlmElementOut[] = [
      {
        entity_name: 'a',
        type: 'static',
        bbox: [0, 0, 0.5, 0.5],
        description: '',
        shape_spec: 'should-be-dropped',
        material_spec: 'should-be-dropped',
      },
    ]
    const merged = await mergeElements(state, llm)
    expect(merged[0]!.shape_spec).toBeUndefined()
    expect(merged[0]!.material_spec).toBeUndefined()
  })

  it('z_index 缺失 → 默认 0', async () => {
    const state = makeState()
    const llm: LlmElementOut[] = [
      { entity_name: 'a', type: 'static', bbox: [0, 0, 0.5, 0.5], description: '' },
    ]
    const merged = await mergeElements(state, llm)
    expect(merged[0]!.z_index).toBe(0)
  })

  it('entity_name 缺失 → 自动生成 unnamed_{id}', async () => {
    const state = makeState()
    const llm: LlmElementOut[] = [
      { entity_name: '', type: 'static', bbox: [0, 0, 0.5, 0.5], description: '' },
    ]
    const merged = await mergeElements(state, llm)
    expect(merged[0]!.name).toMatch(/^unnamed_el_/)
  })
})

describe('mergeElements - cross-state 合并', () => {
  it('已存在同 name 元素 → 加入新 state_id,不复制成两个 element', async () => {
    const state1 = makeState({ id: 'state_canon' })
    const state2 = makeState({ id: 'state_hover' })

    // 先跑 state_canon + 持久化(模拟 pass1-runner 流程)
    const llm1: LlmElementOut[] = [
      { entity_name: '娃娃', type: 'static', bbox: [0.1, 0.2, 0.3, 0.4], description: '' },
    ]
    const after1 = await mergeElements(state1, llm1)
    await saveElementsForPage(TEST_PAGE_ID, after1)

    // 再跑 state_hover,同 entity_name
    const llm2: LlmElementOut[] = [
      { entity_name: '娃娃', type: 'static', bbox: [0.15, 0.22, 0.3, 0.4], description: '' },
    ]
    const merged = await mergeElements(state2, llm2)

    expect(merged).toHaveLength(1)
    expect(merged[0]!.state_ids).toEqual(['state_canon', 'state_hover'])
    // 老字段不被覆盖(用户可能已经在 Element Review 编辑过)
    expect(merged[0]!.bbox).toEqual([0.1, 0.2, 0.3, 0.4])
  })

  it('name 大小写空格不同 → 视为同元素', async () => {
    const state = makeState({ id: 'state_a' })
    const llm1: LlmElementOut[] = [
      { entity_name: 'cute  Doll', type: 'static', bbox: [0, 0, 0.5, 0.5], description: '' },
    ]
    const after1 = await mergeElements(state, llm1)
    await saveElementsForPage(TEST_PAGE_ID, after1)

    const state2 = makeState({ id: 'state_b' })
    const llm2: LlmElementOut[] = [
      { entity_name: 'CUTE doll', type: 'static', bbox: [0, 0, 0.5, 0.5], description: '' },
    ]
    const merged = await mergeElements(state2, llm2)
    expect(merged).toHaveLength(1)
    expect(merged[0]!.state_ids).toEqual(['state_a', 'state_b'])
  })

  it('同 state 内重复 entity_name → 第二条作为新元素(known limitation,实际 LLM 不应输出重复)', async () => {
    const state = makeState()
    const llm: LlmElementOut[] = [
      { entity_name: 'a', type: 'static', bbox: [0, 0, 0.5, 0.5], description: '' },
      { entity_name: 'a', type: 'static', bbox: [0.1, 0.1, 0.4, 0.4], description: '' },
    ]
    const merged = await mergeElements(state, llm)
    // indexedExisting 是从磁盘加载的,同批新增的不进 index
    // 这是已知 trade-off:让 cross-state 检测精确度 > 同批去重(LLM 不应输出重复)
    expect(merged.filter((e) => e.name === 'a')).toHaveLength(2)
  })
})
