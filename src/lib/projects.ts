import path from 'node:path'
import { promises as fs } from 'node:fs'

import type { Project } from '@/lib/types'
import { DATA_ROOT, listJsonInDir, readJson, writeJson } from '@/lib/fs-utils'
import { newProjectId } from '@/lib/id'

const DIR = path.join(DATA_ROOT, 'projects')
const fileFor = (id: string) => path.join(DIR, `${id}.json`)

export async function listProjects(): Promise<Project[]> {
  return listJsonInDir<Project>(DIR)
}

export async function getProject(id: string): Promise<Project | null> {
  return readJson<Project>(fileFor(id))
}

export type CreateProjectInput = {
  name: string
  description?: string
  tech_stack_hint?: string
  cdn_provider_id?: string
}

export async function createProject(input: CreateProjectInput): Promise<Project> {
  const now = new Date().toISOString()
  const project: Project = {
    id: newProjectId(),
    name: input.name,
    ...(input.description !== undefined && { description: input.description }),
    ...(input.tech_stack_hint !== undefined && { tech_stack_hint: input.tech_stack_hint }),
    ...(input.cdn_provider_id !== undefined && { cdn_provider_id: input.cdn_provider_id }),
    created_at: now,
    updated_at: now,
  }
  await writeJson(fileFor(project.id), project)
  return project
}

export async function updateProject(id: string, patch: Partial<Project>): Promise<Project | null> {
  const existing = await getProject(id)
  if (!existing) return null
  const next: Project = {
    ...existing,
    ...patch,
    id: existing.id, // 锁定 id 不可改
    updated_at: new Date().toISOString(),
  }
  await writeJson(fileFor(id), next)
  return next
}

export async function deleteProject(id: string): Promise<boolean> {
  try {
    await fs.unlink(fileFor(id))
    return true
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw e
  }
}
