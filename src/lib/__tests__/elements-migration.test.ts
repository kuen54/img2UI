import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { DATA_ROOT } from '@/lib/fs-utils'
import { getElementsByPage } from '@/lib/elements'

const TEST_PAGE_ID = 'pg_migration_test'

describe('elements migration: legacy without visual_category', () => {
  const legacyPath = path.join(DATA_ROOT, 'elements', `${TEST_PAGE_ID}.json`)

  beforeEach(async () => {
    await fs.mkdir(path.dirname(legacyPath), { recursive: true })
    // 旧格式:无 visual_category 字段
    await fs.writeFile(legacyPath, JSON.stringify([{
      id: 'el_old',
      page_id: TEST_PAGE_ID,
      state_ids: ['s1'],
      name: '老元素',
      type: 'static',
      bbox: [0, 0, 1, 1],
      z_index: 0,
      description: '',
      reviewed: false,
      created_at: '', updated_at: '',
    }]))
  })

  afterEach(async () => {
    await fs.unlink(legacyPath).catch(() => {})
  })

  it('defaults visual_category to "other" for legacy elements', async () => {
    const els = await getElementsByPage(TEST_PAGE_ID)
    expect(els[0]?.visual_category).toBe('other')
  })

  it('preserves visual_category when present', async () => {
    await fs.writeFile(legacyPath, JSON.stringify([{
      id: 'el_new',
      page_id: TEST_PAGE_ID,
      state_ids: ['s1'],
      name: '新元素',
      type: 'static',
      visual_category: 'subject',
      bbox: [0, 0, 1, 1],
      z_index: 0,
      description: '',
      reviewed: false,
      created_at: '', updated_at: '',
    }]))
    const els = await getElementsByPage(TEST_PAGE_ID)
    expect(els[0]?.visual_category).toBe('subject')
  })
})
