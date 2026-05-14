import path from 'node:path'

import type { PipelineRun, PipelinePassKind } from '@/lib/types'
import { DATA_ROOT, readJson, writeJson, listJsonInDir } from '@/lib/fs-utils'
import { newRunId } from '@/lib/id'

const DIR = path.join(DATA_ROOT, 'pipelines')
const fileFor = (id: string) => path.join(DIR, `${id}.json`)

export async function getRun(id: string): Promise<PipelineRun | null> {
  return readJson<PipelineRun>(fileFor(id))
}

// 列出某 state 下属于同一个 parent pass 的 sub-runs(pass1_* 或 pass2_*)
// 用于 PipelineProgress 多路进度展示。
export async function listSubRuns(stateId: string, parent: 'pass1' | 'pass2'): Promise<PipelineRun[]> {
  const all = await listJsonInDir<PipelineRun>(DIR)
  return all
    .filter((r) => r.state_id === stateId)
    .filter((r) => r.pass.startsWith(`${parent}_`))
    .sort((a, b) => a.started_at.localeCompare(b.started_at))
}

export type CreateRunInput = {
  state_id: string
  pass: PipelinePassKind
  llm_request: PipelineRun['llm_request']
}

export async function createRun(input: CreateRunInput): Promise<PipelineRun> {
  const run: PipelineRun = {
    id: newRunId(),
    state_id: input.state_id,
    pass: input.pass,
    status: 'running',
    started_at: new Date().toISOString(),
    llm_request: input.llm_request,
    llm_response: {},
  }
  await writeJson(fileFor(run.id), run)
  return run
}

export type CompleteRunPatch = {
  llm_response?: Record<string, unknown>
  parsed_result?: Record<string, unknown>
}

export async function completeRun(id: string, patch: CompleteRunPatch = {}): Promise<PipelineRun | null> {
  const existing = await getRun(id)
  if (!existing) return null
  const next: PipelineRun = {
    ...existing,
    status: 'completed',
    completed_at: new Date().toISOString(),
    ...(patch.llm_response !== undefined && { llm_response: patch.llm_response }),
    ...(patch.parsed_result !== undefined && { parsed_result: patch.parsed_result }),
  }
  await writeJson(fileFor(id), next)
  return next
}

export async function failRun(id: string, error: PipelineRun['error']): Promise<PipelineRun | null> {
  const existing = await getRun(id)
  if (!existing) return null
  const next: PipelineRun = {
    ...existing,
    status: 'failed',
    completed_at: new Date().toISOString(),
    ...(error !== undefined && { error }),
  }
  await writeJson(fileFor(id), next)
  return next
}
