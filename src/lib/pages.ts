import path from 'node:path'
import { promises as fs } from 'node:fs'

import type { Page } from '@/lib/types'
import { DATA_ROOT, listJsonInDir, readJson, writeJson } from '@/lib/fs-utils'
import { newPageId } from '@/lib/id'
import { getState } from '@/lib/states'
import { generateThumbnail } from '@/lib/thumbnails'

const DIR = path.join(DATA_ROOT, 'pages')
const fileFor = (id: string) => path.join(DIR, `${id}.json`)

export async function listPages(): Promise<Page[]> {
  return listJsonInDir<Page>(DIR)
}

export async function listPagesByProject(projectId: string): Promise<Page[]> {
  const all = await listPages()
  return all.filter((p) => p.project_id === projectId)
}

export async function getPage(id: string): Promise<Page | null> {
  return readJson<Page>(fileFor(id))
}

export type CreatePageInput = {
  project_id: string
  name: string
  route_hint?: string
}

export async function createPage(input: CreatePageInput): Promise<Page> {
  const now = new Date().toISOString()
  const page: Page = {
    id: newPageId(),
    project_id: input.project_id,
    name: input.name,
    ...(input.route_hint !== undefined && { route_hint: input.route_hint }),
    canonical_state_id: '',
    created_at: now,
    updated_at: now,
  }
  await writeJson(fileFor(page.id), page)
  return page
}

export async function updatePage(id: string, patch: Partial<Page>): Promise<Page | null> {
  const existing = await getPage(id)
  if (!existing) return null
  const next: Page = {
    ...existing,
    ...patch,
    id: existing.id,
    project_id: existing.project_id, // 不可换 project
    updated_at: new Date().toISOString(),
  }
  await writeJson(fileFor(id), next)
  return next
}

export async function deletePage(id: string): Promise<boolean> {
  try {
    await fs.unlink(fileFor(id))
    return true
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw e
  }
}

export async function deletePagesByProject(projectId: string): Promise<string[]> {
  const pages = await listPagesByProject(projectId)
  const deleted: string[] = []
  for (const p of pages) {
    if (await deletePage(p.id)) deleted.push(p.id)
  }
  return deleted
}

/**
 * 为 page 生成缩略图(canonical state 的 256px 版本)。
 *
 * 调用时机:canonical state 上传/重新指派时(见 src/app/api/pages/[id]/states/route.ts)。
 * - page 不存在 / 无 canonical_state_id / canonical state PNG 不在盘上 → 返回 null,不报错
 * - 成功生成 → 写入 data/thumbs/{pageId}.png 并把路径写回 page.thumbnail_path
 *
 * 见 SPEC.md § 缩略图生成。
 */
export async function maybeGenerateThumbnailForPage(pageId: string): Promise<string | null> {
  const page = await getPage(pageId)
  if (!page) return null
  if (!page.canonical_state_id) return null

  const state = await getState(page.canonical_state_id)
  if (!state) return null

  let buffer: Buffer
  try {
    buffer = await fs.readFile(state.original_image_path)
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw e
  }

  const outPath = await generateThumbnail(pageId, buffer)
  await updatePage(pageId, { thumbnail_path: outPath })
  return outPath
}
