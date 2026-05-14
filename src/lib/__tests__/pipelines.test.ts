import { describe, it, expect, afterEach } from 'vitest'
import { promises as fs } from 'node:fs'

import { DATA_ROOT } from '@/lib/fs-utils'
import { createRun, completeRun, listSubRuns, getRun } from '@/lib/pipelines'

afterEach(async () => {
  await fs.rm(DATA_ROOT, { recursive: true, force: true })
})

describe('pipelines.listSubRuns', () => {
  const baseLlm = {
    provider_id: 'p',
    model: 'm',
    prompt: '',
    images: [],
    extra: {},
  }

  it('returns sub-runs filtered by stateId + parent prefix, sorted by started_at', async () => {
    const sub1 = await createRun({ state_id: 's1', pass: 'pass1_subject', llm_request: baseLlm })
    const sub2 = await createRun({ state_id: 's1', pass: 'pass1_button', llm_request: baseLlm })
    // 不同 state 的 sub-run 应被过滤掉
    await createRun({ state_id: 's2', pass: 'pass1_subject', llm_request: baseLlm })
    // 不同 parent 的应被过滤掉
    await createRun({ state_id: 's1', pass: 'pass2_subject', llm_request: baseLlm })

    const subs = await listSubRuns('s1', 'pass1')
    expect(subs.length).toBe(2)
    expect(subs.map((r) => r.id).sort()).toEqual([sub1.id, sub2.id].sort())
    // 只包含 pass1_*
    expect(subs.every((r) => r.pass.startsWith('pass1_'))).toBe(true)
  })

  it('does not include parent run (pass: pass1) itself', async () => {
    await createRun({ state_id: 's1', pass: 'pass1', llm_request: baseLlm })
    await createRun({ state_id: 's1', pass: 'pass1_subject', llm_request: baseLlm })
    const subs = await listSubRuns('s1', 'pass1')
    expect(subs.length).toBe(1)
    expect(subs[0]!.pass).toBe('pass1_subject')
  })

  it('reports completed status correctly via getRun', async () => {
    const sub = await createRun({ state_id: 's1', pass: 'pass1_subject', llm_request: baseLlm })
    await completeRun(sub.id)
    const subs = await listSubRuns('s1', 'pass1')
    expect(subs[0]!.status).toBe('completed')
    expect((await getRun(sub.id))!.status).toBe('completed')
  })

  it('returns empty when no sub-runs exist', async () => {
    expect(await listSubRuns('nonexistent', 'pass1')).toEqual([])
  })
})
