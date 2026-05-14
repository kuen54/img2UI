import path from 'node:path'
import { promises as fs } from 'node:fs'

import type { Asset, AssetStatus } from '@/lib/types'
import { DATA_ROOT, listJsonInDir, readJson, writeJson } from '@/lib/fs-utils'

const META_DIR = path.join(DATA_ROOT, 'assets')
const BIN_DIR = path.join(DATA_ROOT, 'assets-bin')
const metaFor = (id: string) => path.join(META_DIR, `${id}.json`)
const binFor = (id: string) => path.join(BIN_DIR, `${id}.png`)

export async function listAssetsByPage(pageId: string): Promise<Asset[]> {
  const all = await listJsonInDir<Asset>(META_DIR)
  return all.filter((a) => a.page_id === pageId)
}

export async function getAsset(id: string): Promise<Asset | null> {
  return readJson<Asset>(metaFor(id))
}

export type CreateAssetInput = {
  id: string  // 跟 element_id 一致
  element_id: string
  page_id: string
  width: number
  height: number
  alpha_quality?: number
  status?: AssetStatus
}

export async function createOrUpdateAsset(input: CreateAssetInput): Promise<Asset> {
  const now = new Date().toISOString()
  const existing = await getAsset(input.id)
  const asset: Asset = {
    id: input.id,
    element_id: input.element_id,
    page_id: input.page_id,
    local_path: binFor(input.id),
    width: input.width,
    height: input.height,
    alpha_quality: input.alpha_quality ?? 1,
    status: input.status ?? 'extracted',
    created_at: existing?.created_at ?? now,
    updated_at: now,
  }
  await writeJson(metaFor(asset.id), asset)
  return asset
}

export async function patchAsset(
  id: string,
  patch: Partial<Pick<Asset, 'cdn_url' | 'status' | 'alpha_quality' | 'validation_notes'>>,
): Promise<Asset | null> {
  const existing = await getAsset(id)
  if (!existing) return null
  const next: Asset = {
    ...existing,
    ...(patch.cdn_url !== undefined && { cdn_url: patch.cdn_url }),
    ...(patch.status !== undefined && { status: patch.status }),
    ...(patch.alpha_quality !== undefined && { alpha_quality: patch.alpha_quality }),
    ...(patch.validation_notes !== undefined && { validation_notes: patch.validation_notes }),
    updated_at: new Date().toISOString(),
  }
  await writeJson(metaFor(id), next)
  return next
}

export async function writeAssetBinary(id: string, buffer: Buffer): Promise<void> {
  await fs.mkdir(BIN_DIR, { recursive: true })
  await fs.writeFile(binFor(id), buffer)
}

export async function readAssetBinary(id: string): Promise<Buffer | null> {
  try {
    return await fs.readFile(binFor(id))
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw e
  }
}

export async function deleteAsset(id: string): Promise<boolean> {
  let removed = false
  try {
    await fs.unlink(metaFor(id))
    removed = true
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e
  }
  await fs.unlink(binFor(id)).catch(() => {})
  return removed
}
