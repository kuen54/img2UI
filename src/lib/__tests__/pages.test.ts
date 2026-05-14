import { describe, it, expect, afterEach } from 'vitest'
import { promises as fs } from 'node:fs'

import { DATA_ROOT } from '@/lib/fs-utils'
import {
  createPage,
  getPage,
  listPagesByProject,
  deletePagesByProject,
} from '@/lib/pages'

afterEach(async () => {
  await fs.rm(DATA_ROOT, { recursive: true, force: true })
})

describe('pages lib', () => {
  it('createPage seeds canonical_state_id=""', async () => {
    const page = await createPage({ project_id: 'proj_x', name: 'home' })
    expect(page.canonical_state_id).toBe('')
    expect(page.project_id).toBe('proj_x')
  })

  it('listPagesByProject filters correctly', async () => {
    await createPage({ project_id: 'proj_a', name: 'a1' })
    await createPage({ project_id: 'proj_a', name: 'a2' })
    await createPage({ project_id: 'proj_b', name: 'b1' })
    const aPages = await listPagesByProject('proj_a')
    expect(aPages.length).toBe(2)
    const bPages = await listPagesByProject('proj_b')
    expect(bPages.length).toBe(1)
  })

  it('deletePagesByProject removes only that project', async () => {
    const a = await createPage({ project_id: 'proj_a', name: 'a1' })
    const b = await createPage({ project_id: 'proj_b', name: 'b1' })
    await deletePagesByProject('proj_a')
    expect(await getPage(a.id)).toBeNull()
    expect(await getPage(b.id)?.then((p) => p?.id)).toBe(b.id)
  })
})
