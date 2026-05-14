import path from 'node:path'
import { promises as fs } from 'node:fs'

import type { Page } from '@/lib/types'
import { DATA_ROOT, listJsonInDir, readJson, writeJson } from '@/lib/fs-utils'
import { newPageId } from '@/lib/id'

const DIR = path.join(DATA_ROOT, 'pages')
const fileFor = (id: string) => path.join(DIR, `${id}.json`)

export async function listPages(): Promise<Page[]> {
  return listJsonInDir<Page>(DIR)
}

export async function listPagesByProject(projectId: string): Promise<Page[]> {
  const all = await listPages()
  return all.filter((p) => p.project_id === projectId)
}

export async function getPage(id: string): Promise<Page | null> {
  return readJson<Page>(fileFor(id))
}

export type CreatePageInput = {
  project_id: string
  name: string
  route_hint?: string
}

export async function createPage(input: CreatePageInput): Promise<Page> {
  const now = new Date().toISOString()
  const page: Page = {
    id: newPageId(),
    project_id: input.project_id,
    name: input.name,
    ...(input.route_hint !== undefined && { route_hint: input.route_hint }),
    canonical_state_id: '',
    created_at: now,
    updated_at: now,
  }
  await writeJson(fileFor(page.id), page)
  return page
}

export async function updatePage(id: string, patch: Partial<Page>): Promise<Page | null> {
  const existing = await getPage(id)
  if (!existing) return null
  const next: Page = {
    ...existing,
    ...patch,
    id: existing.id,
    project_id: existing.project_id, // 不可换 project
    updated_at: new Date().toISOString(),
  }
  await writeJson(fileFor(id), next)
  return next
}

export async function deletePage(id: string): Promise<boolean> {
  try {
    await fs.unlink(fileFor(id))
    return true
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw e
  }
}

export async function deletePagesByProject(projectId: string): Promise<string[]> {
  const pages = await listPagesByProject(projectId)
  const deleted: string[] = []
  for (const p of pages) {
    if (await deletePage(p.id)) deleted.push(p.id)
  }
  return deleted
}
