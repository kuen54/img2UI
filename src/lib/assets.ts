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
