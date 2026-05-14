import path from 'node:path'
import { promises as fs } from 'node:fs'

import type { Element, VisualCategory } from '@/lib/types'
import { DATA_ROOT, readJson, writeJson } from '@/lib/fs-utils'

// 每个 page 一份 Element[],整批替换写(SPEC.md § 文件系统布局)

const DIR = path.join(DATA_ROOT, 'elements')
const fileFor = (pageId: string) => path.join(DIR, `${pageId}.json`)

export async function getElementsByPage(pageId: string): Promise<Element[]> {
  const raw = (await readJson<Element[]>(fileFor(pageId))) ?? []
  // 兼容 Phase 8b 之前的旧数据(无 visual_category 字段),兜底 'other'
  return raw.map((el) => ({
    ...el,
    visual_category: el.visual_category ?? ('other' as VisualCategory),
  }))
}

export async function saveElementsForPage(pageId: string, elements: Element[]): Promise<void> {
  await writeJson(fileFor(pageId), elements)
}

export async function deleteElementsForPage(pageId: string): Promise<void> {
  await fs.unlink(fileFor(pageId)).catch(() => {})
}
