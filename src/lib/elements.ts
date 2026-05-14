import path from 'node:path'

import type { Element } from '@/lib/types'
import { DATA_ROOT, readJson, writeJson } from '@/lib/fs-utils'

// 每个 page 一份 Element[],整批替换写(SPEC.md § 文件系统布局)

const DIR = path.join(DATA_ROOT, 'elements')
const fileFor = (pageId: string) => path.join(DIR, `${pageId}.json`)

export async function getElementsByPage(pageId: string): Promise<Element[]> {
  return (await readJson<Element[]>(fileFor(pageId))) ?? []
}

export async function saveElementsForPage(pageId: string, elements: Element[]): Promise<void> {
  await writeJson(fileFor(pageId), elements)
}
