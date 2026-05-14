import { describe, it, expect, afterEach } from 'vitest'
import { promises as fs } from 'node:fs'

import { DATA_ROOT } from '@/lib/fs-utils'
import {
  listProjects,
  getProject,
  createProject,
  updateProject,
  deleteProject,
} from '@/lib/projects'

afterEach(async () => {
  await fs.rm(DATA_ROOT, { recursive: true, force: true })
})

describe('projects lib', () => {
  it('createProject + getProject roundtrip', async () => {
    const created = await createProject({ name: 'Test', tech_stack_hint: 'Next.js' })
    expect(created.id).toMatch(/^proj_/)
    const got = await getProject(created.id)
    expect(got?.name).toBe('Test')
    expect(got?.tech_stack_hint).toBe('Next.js')
  })

  it('listProjects empty on no dir', async () => {
    expect(await listProjects()).toEqual([])
  })

  it('listProjects after creating multiple', async () => {
    await createProject({ name: 'A' })
    await createProject({ name: 'B' })
    const list = await listProjects()
    expect(list.length).toBe(2)
  })

  it('updateProject preserves id and bumps updated_at', async () => {
    const created = await createProject({ name: 'Old' })
    await new Promise((r) => setTimeout(r, 10))
    const updated = await updateProject(created.id, { name: 'New' })
    expect(updated?.id).toBe(created.id)
    expect(updated?.name).toBe('New')
    expect(updated?.updated_at).not.toBe(created.updated_at)
  })

  it('updateProject returns null on missing', async () => {
    const updated = await updateProject('proj_nope', { name: 'X' })
    expect(updated).toBeNull()
  })

  it('deleteProject returns true on hit, false on miss', async () => {
    const created = await createProject({ name: 'X' })
    expect(await deleteProject(created.id)).toBe(true)
    expect(await deleteProject(created.id)).toBe(false)
  })
})
