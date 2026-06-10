import {
  paths,
  readJsonIfExists,
  writeJsonAtomic,
  unlinkIfExists,
  ensureDataRoot,
  readdirIfExists,
  DATA_ROOT,
} from './fs-utils'
import path from 'node:path'
import type { Asset } from './types'

export async function getAsset(id: string): Promise<Asset | null> {
  return readJsonIfExists<Asset>(paths.asset(id))
}

export async function saveAsset(asset: Asset): Promise<Asset> {
  await ensureDataRoot()
  await writeJsonAtomic(paths.asset(asset.id), asset)
  return asset
}

export async function deleteAsset(id: string): Promise<void> {
  await unlinkIfExists(paths.asset(id))
}

export async function listAssetsForPage(pageId: string): Promise<Asset[]> {
  await ensureDataRoot()
  const dir = path.join(DATA_ROOT, 'assets')
  const files = await readdirIfExists(dir)
  const all = await Promise.all(
    files
      .filter((f) => f.endsWith('.json'))
      .map((f) => readJsonIfExists<Asset>(path.join(dir, f))),
  )
  return all.filter((a): a is Asset => a !== null && a.page_id === pageId)
}

/**
 * 删除 page 下所有 element_id 不在 keep 集合里的 Asset(连带 assets-bin PNG)。
 * Pass 1 整批替换 elements 后调用,防止旧 element 的 asset 变成孤儿污染 export。
 * 返回删除数。
 */
export async function deleteAssetsNotIn(
  pageId: string,
  keepElementIds: ReadonlySet<string>,
): Promise<number> {
  const all = await listAssetsForPage(pageId)
  let removed = 0
  for (const a of all) {
    if (keepElementIds.has(a.element_id)) continue
    await unlinkIfExists(paths.assetBin(a.id))
    await deleteAsset(a.id)
    removed++
  }
  return removed
}
