import {
  paths,
  readJsonIfExists,
  writeJsonAtomic,
  unlinkIfExists,
  ensureDataRoot,
} from './fs-utils'
import type { LayoutElement, PipelineRun } from './types'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { DATA_ROOT } from './fs-utils'

// ─── Elements(整 page 整批替换,HANDOFF §11.3) ─────────────────────────

export async function getElementsForPage(
  pageId: string,
): Promise<LayoutElement[]> {
  const data = await readJsonIfExists<{ elements: LayoutElement[] }>(
    paths.elements(pageId),
  )
  return data?.elements ?? []
}

export async function saveElementsForPage(
  pageId: string,
  elements: LayoutElement[],
): Promise<void> {
  await ensureDataRoot()
  await writeJsonAtomic(paths.elements(pageId), { elements })
}

export async function deleteElementsForPage(pageId: string): Promise<void> {
  await unlinkIfExists(paths.elements(pageId))
}

// ─── PipelineRun ────────────────────────────────────────────────────────

export async function createPipelineRun(
  run: PipelineRun,
): Promise<PipelineRun> {
  await ensureDataRoot()
  await writeJsonAtomic(paths.pipelineRun(run.id), run)
  return run
}

export async function getPipelineRun(
  id: string,
): Promise<PipelineRun | null> {
  return readJsonIfExists<PipelineRun>(paths.pipelineRun(id))
}

export async function updatePipelineRun(
  id: string,
  patch: Partial<PipelineRun>,
): Promise<PipelineRun | null> {
  const current = await getPipelineRun(id)
  if (!current) return null
  const next: PipelineRun = { ...current, ...patch, id: current.id }
  await writeJsonAtomic(paths.pipelineRun(id), next)
  return next
}

/** 列某 state 下所有 PipelineRun(用于 audit / 复跑) */
export async function listPipelineRunsByState(
  stateId: string,
): Promise<PipelineRun[]> {
  await ensureDataRoot()
  const dir = path.join(DATA_ROOT, 'pipelines')
  let files: string[] = []
  try {
    files = await fs.readdir(dir)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw err
  }
  const runs = await Promise.all(
    files
      .filter((f) => f.endsWith('.json'))
      .map((f) => readJsonIfExists<PipelineRun>(path.join(dir, f))),
  )
  return runs
    .filter((r): r is PipelineRun => r !== null && r.state_id === stateId)
    .sort((a, b) => a.started_at.localeCompare(b.started_at))
}
