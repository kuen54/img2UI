import { describe, it, expect, afterEach } from 'vitest'
import { promises as fs } from 'node:fs'
import path from 'node:path'

import { DATA_ROOT } from '@/lib/fs-utils'
import {
  createState,
  getState,
  setPipelineStatus,
  writeStateRawImage,
  deleteState,
  listStatesByPage,
} from '@/lib/states'

afterEach(async () => {
  await fs.rm(DATA_ROOT, { recursive: true, force: true })
})

describe('states lib', () => {
  it('createState defaults to idle status', async () => {
    const state = await createState({ page_id: 'page_x', name: 'canonical', width: 472, height: 1024 })
    expect(state.pipeline_status).toBe('idle')
    expect(state.original_image_path).toContain('raw')
  })

  it('writeStateRawImage writes PNG bytes to raw/{id}.png', async () => {
    const state = await createState({ page_id: 'p1', name: 'c', width: 100, height: 100 })
    const fakePng = Buffer.from([0x89, 0x50, 0x4e, 0x47])
    await writeStateRawImage(state.id, fakePng)
    const written = await fs.readFile(path.join(DATA_ROOT, 'raw', `${state.id}.png`))
    expect(written.equals(fakePng)).toBe(true)
  })

  it('setPipelineStatus updates status + pass1_run_id', async () => {
    const state = await createState({ page_id: 'p1', name: 'c', width: 1, height: 1 })
    const updated = await setPipelineStatus(state.id, 'pass1_done', { pass1_run_id: 'run_1' })
    expect(updated?.pipeline_status).toBe('pass1_done')
    expect(updated?.pass1_run_id).toBe('run_1')
  })

  it('deleteState removes both json and raw png', async () => {
    const state = await createState({ page_id: 'p1', name: 'c', width: 1, height: 1 })
    await writeStateRawImage(state.id, Buffer.from([1, 2, 3]))
    expect(await deleteState(state.id)).toBe(true)
    expect(await getState(state.id)).toBeNull()
    await expect(fs.access(path.join(DATA_ROOT, 'raw', `${state.id}.png`))).rejects.toThrow()
  })

  it('listStatesByPage filters by page_id', async () => {
    await createState({ page_id: 'p1', name: 'a', width: 1, height: 1 })
    await createState({ page_id: 'p1', name: 'b', width: 1, height: 1 })
    await createState({ page_id: 'p2', name: 'c', width: 1, height: 1 })
    const p1 = await listStatesByPage('p1')
    expect(p1.length).toBe(2)
  })
})
