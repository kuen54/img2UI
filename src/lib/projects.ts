import {
  paths,
  readJsonIfExists,
  writeJsonAtomic,
  writeAtomic,
  unlinkIfExists,
  rmIfExists,
  readdirIfExists,
  ensureDataRoot,
  DATA_ROOT,
} from './fs-utils'
import { newId, nowIso } from './id'
import type { Project, Page, StateRecord, PipelineRun } from './types'
import path from 'node:path'

// ─── Project ──────────────────────────────────────────────────────────────

export async function createProject(input: {
  name: string
  description?: string
  cdn_provider_id?: string
}): Promise<Project> {
  await ensureDataRoot()
  const now = nowIso()
  const project: Project = {
    id: newId(),
    name: input.name,
    ...(input.description !== undefined ? { description: input.description } : {}),
    ...(input.cdn_provider_id !== undefined
      ? { cdn_provider_id: input.cdn_provider_id }
      : {}),
    created_at: now,
    updated_at: now,
  }
  await writeJsonAtomic(paths.project(project.id), project)
  return project
}

export async function getProject(id: string): Promise<Project | null> {
  return readJsonIfExists<Project>(paths.project(id))
}

export async function listProjects(): Promise<Project[]> {
  await ensureDataRoot()
  const dir = path.join(DATA_ROOT, 'projects')
  const files = await readdirIfExists(dir)
  const projects = await Promise.all(
    files
      .filter((f) => f.endsWith('.json'))
      .map((f) => readJsonIfExists<Project>(path.join(dir, f))),
  )
  return projects
    .filter((p): p is Project => p !== null)
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
}

export async function updateProject(
  id: string,
  patch: Partial<Project>,
): Promise<Project | null> {
  const current = await getProject(id)
  if (!current) return null
  const next: Project = {
    ...current,
    ...patch,
    id: current.id, // immutable
    created_at: current.created_at, // immutable
    updated_at: nowIso(),
  }
  await writeJsonAtomic(paths.project(id), next)
  return next
}

export async function deleteProject(id: string): Promise<void> {
  const pages = await listPagesByProject(id)
  for (const p of pages) {
    await deletePage(p.id)
  }
  await unlinkIfExists(paths.project(id))
}

// ─── Page ─────────────────────────────────────────────────────────────────

export async function createPage(input: {
  project_id: string
  name: string
  route_hint?: string
}): Promise<Page> {
  await ensureDataRoot()
  const now = nowIso()
  const page: Page = {
    id: newId(),
    project_id: input.project_id,
    name: input.name,
    ...(input.route_hint !== undefined ? { route_hint: input.route_hint } : {}),
    canonical_state_id: '', // 上传第一张图后填充
    created_at: now,
    updated_at: now,
  }
  await writeJsonAtomic(paths.page(page.id), page)
  return page
}

export async function getPage(id: string): Promise<Page | null> {
  return readJsonIfExists<Page>(paths.page(id))
}

export async function listPagesByProject(projectId: string): Promise<Page[]> {
  await ensureDataRoot()
  const dir = path.join(DATA_ROOT, 'pages')
  const files = await readdirIfExists(dir)
  const pages = await Promise.all(
    files
      .filter((f) => f.endsWith('.json'))
      .map((f) => readJsonIfExists<Page>(path.join(dir, f))),
  )
  return pages
    .filter((p): p is Page => p !== null && p.project_id === projectId)
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
}

export async function updatePage(
  id: string,
  patch: Partial<Page>,
): Promise<Page | null> {
  const current = await getPage(id)
  if (!current) return null
  const next: Page = {
    ...current,
    ...patch,
    id: current.id,
    project_id: current.project_id,
    created_at: current.created_at,
    updated_at: nowIso(),
  }
  await writeJsonAtomic(paths.page(id), next)
  return next
}

export async function deletePage(id: string): Promise<void> {
  const states = await listStatesByPage(id)
  for (const s of states) {
    await deleteState(s.id)
  }
  await unlinkIfExists(paths.elements(id))
  await unlinkIfExists(paths.page(id))
}

// ─── State ────────────────────────────────────────────────────────────────

export async function createState(input: {
  page_id: string
  name: string
  imageBuffer: Buffer
  width: number
  height: number
}): Promise<StateRecord> {
  await ensureDataRoot()
  const now = nowIso()
  const state: StateRecord = {
    id: newId(),
    page_id: input.page_id,
    name: input.name,
    original_image_path: paths.raw(''), // placeholder, will fix after we have id
    width: input.width,
    height: input.height,
    pipeline_status: 'idle',
    created_at: now,
  }
  state.original_image_path = paths.raw(state.id)
  // 先写图,再写 state 元数据 — 防止有 state 但无图的孤儿
  await writeAtomic(paths.raw(state.id), input.imageBuffer)
  await writeJsonAtomic(paths.state(state.id), state)
  return state
}

export async function getState(id: string): Promise<StateRecord | null> {
  return readJsonIfExists<StateRecord>(paths.state(id))
}

export async function listStatesByPage(pageId: string): Promise<StateRecord[]> {
  await ensureDataRoot()
  const dir = path.join(DATA_ROOT, 'states')
  const files = await readdirIfExists(dir)
  const states = await Promise.all(
    files
      .filter((f) => f.endsWith('.json'))
      .map((f) => readJsonIfExists<StateRecord>(path.join(dir, f))),
  )
  return states
    .filter((s): s is StateRecord => s !== null && s.page_id === pageId)
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
}

export async function updateState(
  id: string,
  patch: Partial<StateRecord>,
): Promise<StateRecord | null> {
  const current = await getState(id)
  if (!current) return null
  const next: StateRecord = {
    ...current,
    ...patch,
    id: current.id,
    page_id: current.page_id,
    created_at: current.created_at,
  }
  await writeJsonAtomic(paths.state(id), next)
  return next
}

export async function deleteState(id: string): Promise<void> {
  // 删 raw / thumb / pass2 / keyed / slices / pipeline-runs of this state
  await unlinkIfExists(paths.raw(id))
  await unlinkIfExists(paths.thumb(id))
  // pass2 / keyed / slices 是 {state}-{cat}.* / {state}-{cat}/ 形式
  const pass2Dir = path.join(DATA_ROOT, 'pass2')
  const keyedDir = path.join(DATA_ROOT, 'keyed')
  const slicesDir = path.join(DATA_ROOT, 'slices')
  for (const dir of [pass2Dir, keyedDir]) {
    const files = await readdirIfExists(dir)
    await Promise.all(
      files
        .filter((f) => f.startsWith(`${id}-`))
        .map((f) => unlinkIfExists(path.join(dir, f))),
    )
  }
  const sliceSubs = await readdirIfExists(slicesDir)
  await Promise.all(
    sliceSubs
      .filter((d) => d.startsWith(`${id}-`))
      .map((d) => rmIfExists(path.join(slicesDir, d))),
  )
  // pipeline-runs by state_id
  const piDir = path.join(DATA_ROOT, 'pipelines')
  const piFiles = await readdirIfExists(piDir)
  for (const f of piFiles.filter((f) => f.endsWith('.json'))) {
    const run = await readJsonIfExists<PipelineRun>(path.join(piDir, f))
    if (run?.state_id === id) {
      await unlinkIfExists(path.join(piDir, f))
    }
  }
  await unlinkIfExists(paths.state(id))
}
