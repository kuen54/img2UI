import { describe, it, expect, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { promises as fs } from 'node:fs'
import sharp from 'sharp'

import { DATA_ROOT } from '@/lib/fs-utils'
import { GET as listProjectsGET } from '@/app/api/projects/route'
import { GET as listPagesGET } from '@/app/api/projects/[id]/pages/route'
import { createProject } from '@/lib/projects'
import { createPage, maybeGenerateThumbnailForPage, updatePage } from '@/lib/pages'
import { createState, writeStateRawImage } from '@/lib/states'
import type { Project, Page } from '@/lib/types'

afterEach(async () => {
  await fs.rm(DATA_ROOT, { recursive: true, force: true })
})

async function makePng(): Promise<Buffer> {
  return sharp({
    create: { width: 600, height: 400, channels: 3, background: { r: 10, g: 20, b: 30 } },
  })
    .png()
    .toBuffer()
}

async function setupPageWithThumbnail(projectId: string, name: string): Promise<Page> {
  const page = await createPage({ project_id: projectId, name })
  const state = await createState({ page_id: page.id, name: 'home', width: 600, height: 400 })
  await writeStateRawImage(state.id, await makePng())
  await updatePage(page.id, { canonical_state_id: state.id })
  await maybeGenerateThumbnailForPage(page.id)
  return (await import('@/lib/pages')).getPage(page.id) as unknown as Page
}

function mkReq(): NextRequest {
  return new NextRequest('http://localhost/api/projects')
}

describe('GET /api/projects (with sample_thumbnail_url)', () => {
  it('decorates sample_thumbnail_url when at least one page has a thumbnail', async () => {
    const proj = await createProject({ name: 'p1' })
    await setupPageWithThumbnail(proj.id, 'with-thumb')

    const res = await listProjectsGET()
    const json = (await res.json()) as Project[]
    expect(json.length).toBe(1)
    expect(json[0]?.sample_thumbnail_url).toMatch(/^\/api\/thumbs\/page_/)
  })

  it('omits sample_thumbnail_url when no page has a thumbnail', async () => {
    const proj = await createProject({ name: 'p_empty' })
    await createPage({ project_id: proj.id, name: 'no-canonical' })

    const res = await listProjectsGET()
    const json = (await res.json()) as Project[]
    expect(json.length).toBe(1)
    expect(json[0]?.sample_thumbnail_url).toBeUndefined()
  })
})

describe('GET /api/projects/[id]/pages (with thumbnail_url)', () => {
  it('decorates thumbnail_url when thumbnail_path is set', async () => {
    const proj = await createProject({ name: 'p2' })
    const page = await setupPageWithThumbnail(proj.id, 'a')
    await createPage({ project_id: proj.id, name: 'b' }) // no thumbnail

    const res = await listPagesGET(new NextRequest(`http://localhost/api/projects/${proj.id}/pages`), {
      params: Promise.resolve({ id: proj.id }),
    })
    const json = (await res.json()) as Page[]
    expect(json.length).toBe(2)
    const a = json.find((p) => p.id === page.id)
    const b = json.find((p) => p.name === 'b')
    expect(a?.thumbnail_url).toBe(`/api/thumbs/${page.id}`)
    expect(b?.thumbnail_url).toBeUndefined()
  })

  it('does not include raw thumbnail_path filesystem path in response', async () => {
    // 安全:不向客户端泄露磁盘路径
    const proj = await createProject({ name: 'p3' })
    await setupPageWithThumbnail(proj.id, 'a')

    const res = await listPagesGET(mkReq(), { params: Promise.resolve({ id: proj.id }) })
    const text = await res.text()
    expect(text).not.toContain('data/thumbs')
    expect(text).not.toContain(DATA_ROOT)
  })
})
