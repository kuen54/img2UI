import path from 'node:path'
import { promises as fs } from 'node:fs'

import type { State, StatePipelineStatus } from '@/lib/types'
import { DATA_ROOT, listJsonInDir, readJson, writeJson } from '@/lib/fs-utils'
import { newStateId } from '@/lib/id'

const DIR = path.join(DATA_ROOT, 'states')
const RAW_DIR = path.join(DATA_ROOT, 'raw')
const fileFor = (id: string) => path.join(DIR, `${id}.json`)
const rawPathFor = (id: string) => path.join(RAW_DIR, `${id}.png`)

export async function listStates(): Promise<State[]> {
  return listJsonInDir<State>(DIR)
}

export async function listStatesByPage(pageId: string): Promise<State[]> {
  const all = await listStates()
  return all.filter((s) => s.page_id === pageId)
}

export async function getState(id: string): Promise<State | null> {
  return readJson<State>(fileFor(id))
}

export type CreateStateInput = {
  page_id: string
  name: string
  width: number
  height: number
}

export async function createState(input: CreateStateInput): Promise<State> {
  const id = newStateId()
  const state: State = {
    id,
    page_id: input.page_id,
    name: input.name,
    original_image_path: rawPathFor(id),
    width: input.width,
    height: input.height,
    pipeline_status: 'idle',
    created_at: new Date().toISOString(),
  }
  await writeJson(fileFor(id), state)
  return state
}

export async function setPipelineStatus(
  id: string,
  status: StatePipelineStatus,
  patch?: Partial<Pick<State, 'pass1_run_id' | 'pass2_run_id'>>,
): Promise<State | null> {
  const existing = await getState(id)
  if (!existing) return null
  const next: State = {
    ...existing,
    pipeline_status: status,
    ...(patch?.pass1_run_id !== undefined && { pass1_run_id: patch.pass1_run_id }),
    ...(patch?.pass2_run_id !== undefined && { pass2_run_id: patch.pass2_run_id }),
  }
  await writeJson(fileFor(id), next)
  return next
}

export async function writeStateRawImage(id: string, buffer: Buffer): Promise<string> {
  await fs.mkdir(RAW_DIR, { recursive: true })
  const targetPath = rawPathFor(id)
  await fs.writeFile(targetPath, buffer)
  return targetPath
}

export async function deleteState(id: string): Promise<boolean> {
  let removed = false
  try {
    await fs.unlink(fileFor(id))
    removed = true
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e
  }
  // raw PNG 删除是 best effort
  await fs.unlink(rawPathFor(id)).catch(() => {})
  return removed
}

export async function deleteStatesByPage(pageId: string): Promise<string[]> {
  const states = await listStatesByPage(pageId)
  const deleted: string[] = []
  for (const s of states) {
    if (await deleteState(s.id)) deleted.push(s.id)
  }
  return deleted
}
