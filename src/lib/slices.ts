// MVP S3 切片库简化版(无 SliceManifest 独立文件)。
// 切片 PNG 落 data/slices/{state}-{cat}/{idx}.png + sidecar {idx}.json(metadata)。
// 指派关系存 Asset.slice_source,反查"未被引用的切片"扫一遍 assets。

import { promises as fs } from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import {
  paths,
  readJsonLenient,
  readdirIfExists,
  writeAtomic,
  writeJsonAtomic,
  unlinkIfExists,
  ensureDataRoot,
  DATA_ROOT,
} from './fs-utils'
import type { SliceInfo, SliceSource, VisualCategory, Asset } from './types'
import { ALL_VISUAL_CATEGORIES } from './visual-category'
import { invalidatePageStats } from './page-stats'

interface SliceSidecar {
  idx: number
  width: number
  height: number
  opaque_pct: number
  bbox: [number, number, number, number]
}

/** 把切片 buffer 写入指定 (state, cat, idx) 位置 + 写 sidecar metadata */
export async function writeSlice(
  stateId: string,
  category: VisualCategory,
  idx: number,
  buffer: Buffer,
  meta: { opaque_pct: number; bbox: [number, number, number, number] },
): Promise<SliceInfo> {
  await ensureDataRoot()
  const dir = paths.sliceDir(stateId, category)
  await fs.mkdir(dir, { recursive: true })
  const png = paths.slice(stateId, category, idx)
  await writeAtomic(png, buffer)
  const sharpMeta = await sharp(buffer).metadata()
  const w = sharpMeta.width ?? 0
  const h = sharpMeta.height ?? 0
  const sidecar: SliceSidecar = { idx, width: w, height: h, opaque_pct: meta.opaque_pct, bbox: meta.bbox }
  await writeJsonAtomic(paths.sliceSidecar(stateId, category, idx), sidecar)
  return {
    state_id: stateId,
    category,
    idx,
    path: png,
    width: w,
    height: h,
    opaque_pct: meta.opaque_pct,
  }
}

/** 列某 state 下所有切片(扫所有 category 子目录) */
export async function listSlicesForState(stateId: string): Promise<SliceInfo[]> {
  const out: SliceInfo[] = []
  for (const cat of ALL_VISUAL_CATEGORIES) {
    out.push(...(await listSlicesForCategory(stateId, cat)))
  }
  return out
}

export async function listSlicesForCategory(
  stateId: string,
  category: VisualCategory,
): Promise<SliceInfo[]> {
  const dir = paths.sliceDir(stateId, category)
  const files = await readdirIfExists(dir)
  const sidecars = files.filter((f) => f.endsWith('.json'))
  const out: SliceInfo[] = []
  for (const f of sidecars) {
    const m = f.match(/^(\d+)\.json$/)
    if (!m) continue
    const idx = parseInt(m[1]!, 10)
    const sidecar = await readJsonLenient<SliceSidecar>(path.join(dir, f))
    if (!sidecar) continue
    out.push({
      state_id: stateId,
      category,
      idx,
      path: paths.slice(stateId, category, idx),
      width: sidecar.width,
      height: sidecar.height,
      opaque_pct: sidecar.opaque_pct,
    })
  }
  return out.sort((a, b) => a.idx - b.idx)
}

/** 找该路下一个可用 idx(用于 sub-crop / re-key 追加) */
export async function nextSliceIdx(
  stateId: string,
  category: VisualCategory,
): Promise<number> {
  const list = await listSlicesForCategory(stateId, category)
  if (list.length === 0) return 0
  return Math.max(...list.map((s) => s.idx)) + 1
}

/** 读切片 PNG buffer */
export async function readSliceBuffer(
  stateId: string,
  category: VisualCategory,
  idx: number,
): Promise<Buffer> {
  return fs.readFile(paths.slice(stateId, category, idx))
}

/** 删切片 PNG + sidecar(整路 / 整 state 删时调,常规不调) */
export async function removeSlice(
  stateId: string,
  category: VisualCategory,
  idx: number,
): Promise<void> {
  await unlinkIfExists(paths.slice(stateId, category, idx))
  await unlinkIfExists(paths.sliceSidecar(stateId, category, idx))
}

// ─── sub-crop:在原切片上按用户给的多个 rects 再切 ─────────────────────────

export async function subCropSlice(
  stateId: string,
  category: VisualCategory,
  idx: number,
  rects: Array<{ x: number; y: number; w: number; h: number }>,
): Promise<SliceInfo[]> {
  if (rects.length === 0) return []
  const orig = await readSliceBuffer(stateId, category, idx)
  const meta = await sharp(orig).metadata()
  const W = meta.width ?? 0
  const H = meta.height ?? 0
  const created: SliceInfo[] = []
  for (const r of rects) {
    let left = Math.round(r.x)
    let top = Math.round(r.y)
    let width = Math.round(r.w)
    let height = Math.round(r.h)
    if (left < 0) { width += left; left = 0 }
    if (top < 0) { height += top; top = 0 }
    if (left + width > W) width = W - left
    if (top + height > H) height = H - top
    if (width < 4 || height < 4) continue

    const buf = await sharp(orig)
      .extract({ left, top, width, height })
      .png()
      .toBuffer()

    // opaque_pct on sub-crop
    const { data, info } = await sharp(buf)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })
    const N = info.width * info.height
    let opaque = 0
    for (let i = 0; i < N; i++) {
      if (data[i * info.channels + 3]! > 200) opaque++
    }
    const pct = (opaque / N) * 100

    const newIdx = await nextSliceIdx(stateId, category)
    const info2 = await writeSlice(stateId, category, newIdx, buf, {
      opaque_pct: pct,
      bbox: [left, top, width, height],
    })
    created.push(info2)
  }
  return created
}

// ─── 指派 / 撤销(MVP S3:Asset.slice_source 反查) ────────────────────────

import { newId, nowIso } from './id'
import { getAsset, saveAsset, deleteAsset, listAssetsForPage } from './assets'

/** 把切片指派给 element:copy → assets-bin + 创建/更新 Asset */
export async function assignSliceToElement(input: {
  elementId: string
  pageId: string
  source: SliceSource
}): Promise<Asset> {
  const sliceBuf = await readSliceBuffer(input.source.state_id, input.source.category, input.source.idx)
  const meta = await sharp(sliceBuf).metadata()
  const w = meta.width ?? 0
  const h = meta.height ?? 0

  // copy 到 assets-bin/{element-id}.png(asset.id == element.id)
  await writeAtomic(paths.assetBin(input.elementId), sliceBuf)

  // 计算 alpha_quality(opaque% / 100,简版)
  const { data, info } = await sharp(sliceBuf)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const N = info.width * info.height
  let opaque = 0
  for (let i = 0; i < N; i++) {
    if (data[i * info.channels + 3]! > 200) opaque++
  }
  const alpha = N > 0 ? opaque / N : 0

  const existing = await getAsset(input.elementId)
  const now = nowIso()
  const asset: Asset = {
    id: input.elementId,
    element_id: input.elementId,
    page_id: input.pageId,
    local_path: paths.assetBin(input.elementId),
    ...(existing?.cdn_url ? { cdn_url: existing.cdn_url } : {}),
    width: w,
    height: h,
    alpha_quality: alpha,
    status: 'extracted',
    slice_source: input.source,
    created_at: existing?.created_at ?? now,
    updated_at: now,
  }
  await saveAsset(asset)
  // 指派改变 total_assets / assigned_static_elements,5s TTL 缓存必须立即失效,
  // 否则导航回详情页的那次 reload 会拿到指派前的 stats(主按钮挂错状态)
  invalidatePageStats(input.pageId)
  return asset
}

/** 撤销指派:删 assets-bin + 删 Asset 记录 */
export async function unassignAsset(elementId: string): Promise<void> {
  // 先读出 page_id 再删(asset.id === element.id),删后失效 page stats 缓存
  const existing = await getAsset(elementId)
  await unlinkIfExists(paths.assetBin(elementId))
  await deleteAsset(elementId)
  if (existing) invalidatePageStats(existing.page_id)
}

/** 反查:某切片当前被哪些 asset 引用(可能多个,因 MVP S3 允许重复指派) */
export async function findAssetsBySliceSource(
  pageId: string,
  source: SliceSource,
): Promise<Asset[]> {
  const all = await listAssetsForPage(pageId)
  return all.filter(
    (a) =>
      a.slice_source &&
      a.slice_source.state_id === source.state_id &&
      a.slice_source.category === source.category &&
      a.slice_source.idx === source.idx,
  )
}

/** 反查:列出某 state 下所有切片 + 是否被引用(各 asset_id) */
export async function listSlicesWithAssignment(
  pageId: string,
  stateId: string,
): Promise<Array<SliceInfo & { assigned_to: string[] }>> {
  const slices = await listSlicesForState(stateId)
  const assets = await listAssetsForPage(pageId)
  return slices.map((s) => ({
    ...s,
    assigned_to: assets
      .filter(
        (a) =>
          a.slice_source &&
          a.slice_source.state_id === s.state_id &&
          a.slice_source.category === s.category &&
          a.slice_source.idx === s.idx,
      )
      .map((a) => a.element_id),
  }))
}

// 避免循环 import:placeholder 不直接调 newId 但保持引用
void newId
