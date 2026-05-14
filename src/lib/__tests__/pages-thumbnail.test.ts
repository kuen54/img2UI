import { describe, it, expect, afterEach } from 'vitest'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'

import { DATA_ROOT } from '@/lib/fs-utils'
import { createPage, getPage, maybeGenerateThumbnailForPage, updatePage } from '@/lib/pages'
import { createState, writeStateRawImage } from '@/lib/states'

afterEach(async () => {
  await fs.rm(DATA_ROOT, { recursive: true, force: true })
})

async function makePng(width = 800, height = 600): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 50, g: 100, b: 150 } },
  })
    .png()
    .toBuffer()
}

describe('maybeGenerateThumbnailForPage', () => {
  it('returns null when page does not exist', async () => {
    const result = await maybeGenerateThumbnailForPage('page_missing')
    expect(result).toBeNull()
  })

  it('returns null when page has no canonical_state_id', async () => {
    const page = await createPage({ project_id: 'proj_x', name: 'no-canonical' })
    const result = await maybeGenerateThumbnailForPage(page.id)
    expect(result).toBeNull()
    const after = await getPage(page.id)
    expect(after?.thumbnail_path).toBeUndefined()
  })

  it('writes thumbnail and persists thumbnail_path when canonical state exists', async () => {
    const page = await createPage({ project_id: 'proj_x', name: 'with-canonical' })
    const state = await createState({ page_id: page.id, name: 'home', width: 800, height: 600 })
    await writeStateRawImage(state.id, await makePng(800, 600))
    await updatePage(page.id, { canonical_state_id: state.id })

    const result = await maybeGenerateThumbnailForPage(page.id)
    expect(result).not.toBeNull()
    expect(result).toBe(path.join(DATA_ROOT, 'thumbs', `${page.id}.png`))

    const stat = await fs.stat(result!)
    expect(stat.isFile()).toBe(true)

    const after = await getPage(page.id)
    expect(after?.thumbnail_path).toBe(path.join(DATA_ROOT, 'thumbs', `${page.id}.png`))
  })

  it('returns null when canonical state PNG is missing on disk', async () => {
    const page = await createPage({ project_id: 'proj_x', name: 'orphan-canonical' })
    const state = await createState({ page_id: page.id, name: 'home', width: 800, height: 600 })
    // 不写 raw image
    await updatePage(page.id, { canonical_state_id: state.id })

    const result = await maybeGenerateThumbnailForPage(page.id)
    expect(result).toBeNull()
  })
})
