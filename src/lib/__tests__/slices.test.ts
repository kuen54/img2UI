// Slice library:Pass 2 切完所有 slices 落到 data/slices/{state-id}-{category}/,
// 用户在 Asset Review 可手动调选 slice → element 的指派。
// 见 plan: feat/slice-library-manual-assign

import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest'
import { promises as fs } from 'node:fs'
import path from 'node:path'

import { DATA_ROOT } from '@/lib/fs-utils'
import {
  writeSlice,
  readSlice,
  listSlices,
  saveManifest,
  assignSliceToElement,
  sliceDirFor,
  slicePathFor,
  manifestPathFor,
} from '@/lib/slices'
import type { SliceManifest } from '@/lib/types'

vi.mock('@/lib/assets', () => ({
  createOrUpdateAsset: vi.fn().mockResolvedValue({ id: 'el', element_id: 'el' }),
}))

import { createOrUpdateAsset } from '@/lib/assets'

const STATE_ID = 'state_test1'
const CAT = 'decoration'

afterEach(async () => {
  await fs.rm(path.join(DATA_ROOT, 'slices'), { recursive: true, force: true })
  await fs.rm(path.join(DATA_ROOT, 'assets-bin'), { recursive: true, force: true })
  await fs.rm(path.join(DATA_ROOT, 'assets'), { recursive: true, force: true })
})

beforeEach(() => {
  vi.mocked(createOrUpdateAsset).mockClear()
})

describe('slices lib paths', () => {
  it('sliceDirFor builds data/slices/{state-id}-{category}/', () => {
    expect(sliceDirFor(STATE_ID, CAT)).toBe(path.join(DATA_ROOT, 'slices', `${STATE_ID}-${CAT}`))
  })
  it('slicePathFor builds {dir}/{idx}.png', () => {
    expect(slicePathFor(STATE_ID, CAT, 3)).toBe(
      path.join(DATA_ROOT, 'slices', `${STATE_ID}-${CAT}`, '3.png'),
    )
  })
  it('manifestPathFor builds {dir}/manifest.json', () => {
    expect(manifestPathFor(STATE_ID, CAT)).toBe(
      path.join(DATA_ROOT, 'slices', `${STATE_ID}-${CAT}`, 'manifest.json'),
    )
  })
})

describe('writeSlice / readSlice', () => {
  it('writeSlice creates file and readSlice retrieves bytes', async () => {
    const buf = Buffer.from('fake-png-bytes')
    await writeSlice(STATE_ID, CAT, 0, buf)
    const back = await readSlice(STATE_ID, CAT, 0)
    expect(back).not.toBeNull()
    expect(back!.equals(buf)).toBe(true)
  })

  it('readSlice returns null on missing file', async () => {
    const back = await readSlice(STATE_ID, CAT, 999)
    expect(back).toBeNull()
  })

  it('writeSlice overwrites prior bytes for same idx', async () => {
    await writeSlice(STATE_ID, CAT, 0, Buffer.from('v1'))
    await writeSlice(STATE_ID, CAT, 0, Buffer.from('v2'))
    const back = await readSlice(STATE_ID, CAT, 0)
    expect(back!.toString()).toBe('v2')
  })
})

describe('saveManifest / listSlices', () => {
  it('listSlices returns null on missing manifest', async () => {
    const m = await listSlices(STATE_ID, CAT)
    expect(m).toBeNull()
  })

  it('saveManifest then listSlices roundtrip', async () => {
    const manifest: SliceManifest = {
      state_id: STATE_ID,
      category: CAT,
      slices: [
        { idx: 0, bbox: [0, 0, 10, 10], opaque_pct: 50, width: 10, height: 10, assigned_element_id: 'el_a' },
        { idx: 1, bbox: [20, 0, 10, 10], opaque_pct: 60, width: 10, height: 10, assigned_element_id: null },
      ],
      created_at: new Date().toISOString(),
    }
    await saveManifest(STATE_ID, CAT, manifest)
    const back = await listSlices(STATE_ID, CAT)
    expect(back).not.toBeNull()
    expect(back!.slices).toHaveLength(2)
    expect(back!.slices[0]!.assigned_element_id).toBe('el_a')
    expect(back!.slices[1]!.assigned_element_id).toBeNull()
  })
})

describe('assignSliceToElement', () => {
  it('copies slice bytes to assets-bin/{element-id}.png and updates manifest', async () => {
    const buf = Buffer.from('slice-bytes')
    await writeSlice(STATE_ID, CAT, 1, buf)
    await saveManifest(STATE_ID, CAT, {
      state_id: STATE_ID,
      category: CAT,
      slices: [
        { idx: 0, bbox: [0, 0, 10, 10], opaque_pct: 50, width: 10, height: 10, assigned_element_id: 'el_a' },
        { idx: 1, bbox: [20, 0, 10, 10], opaque_pct: 60, width: 10, height: 10, assigned_element_id: null },
      ],
      created_at: new Date().toISOString(),
    })

    await assignSliceToElement(STATE_ID, CAT, 1, 'el_b', { page_id: 'pg' })

    // assets-bin/el_b.png 出现
    const binBytes = await fs.readFile(path.join(DATA_ROOT, 'assets-bin', 'el_b.png'))
    expect(binBytes.equals(buf)).toBe(true)

    // manifest 中 idx=1 的 assigned_element_id 更新为 el_b
    const m = await listSlices(STATE_ID, CAT)
    expect(m!.slices[1]!.assigned_element_id).toBe('el_b')

    // createOrUpdateAsset 被调,page_id 透传
    expect(createOrUpdateAsset).toHaveBeenCalledTimes(1)
    expect(vi.mocked(createOrUpdateAsset).mock.calls[0]![0]).toMatchObject({
      id: 'el_b',
      element_id: 'el_b',
      page_id: 'pg',
    })
  })

  it('clears prior assignment if same element previously assigned to different slice', async () => {
    await writeSlice(STATE_ID, CAT, 0, Buffer.from('s0'))
    await writeSlice(STATE_ID, CAT, 1, Buffer.from('s1'))
    await saveManifest(STATE_ID, CAT, {
      state_id: STATE_ID,
      category: CAT,
      slices: [
        { idx: 0, bbox: [0, 0, 10, 10], opaque_pct: 50, width: 10, height: 10, assigned_element_id: 'el_x' },
        { idx: 1, bbox: [20, 0, 10, 10], opaque_pct: 60, width: 10, height: 10, assigned_element_id: null },
      ],
      created_at: new Date().toISOString(),
    })

    // 现在把 el_x 改派到 idx=1
    await assignSliceToElement(STATE_ID, CAT, 1, 'el_x', { page_id: 'pg' })
    const m = await listSlices(STATE_ID, CAT)
    expect(m!.slices[0]!.assigned_element_id).toBeNull()
    expect(m!.slices[1]!.assigned_element_id).toBe('el_x')
  })

  it('throws if slice idx out of range', async () => {
    await saveManifest(STATE_ID, CAT, {
      state_id: STATE_ID,
      category: CAT,
      slices: [
        { idx: 0, bbox: [0, 0, 10, 10], opaque_pct: 50, width: 10, height: 10, assigned_element_id: null },
      ],
      created_at: new Date().toISOString(),
    })
    await expect(
      assignSliceToElement(STATE_ID, CAT, 5, 'el', { page_id: 'pg' }),
    ).rejects.toThrow(/slice idx/)
  })

  it('throws if slice file missing on disk', async () => {
    await saveManifest(STATE_ID, CAT, {
      state_id: STATE_ID,
      category: CAT,
      slices: [
        { idx: 0, bbox: [0, 0, 10, 10], opaque_pct: 50, width: 10, height: 10, assigned_element_id: null },
      ],
      created_at: new Date().toISOString(),
    })
    await expect(
      assignSliceToElement(STATE_ID, CAT, 0, 'el', { page_id: 'pg' }),
    ).rejects.toThrow(/slice file/)
  })

  it('throws if manifest missing', async () => {
    await expect(
      assignSliceToElement(STATE_ID, CAT, 0, 'el', { page_id: 'pg' }),
    ).rejects.toThrow(/manifest/)
  })
})
