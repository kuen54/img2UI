// Slice library:Pass 2 输出的所有切片都先落到 data/slices/{state-id}-{category}/,
// 然后按 (y,x) 默认指派给该 category 的 elements;用户可手动改派。
//
// 设计原则:
// - 切片文件不可变(idx 一旦写入就是固定 PNG bytes)
// - 切片 ↔ element 是多对一(一个 element 同时只指派 1 个 slice;一个 slice 可只指派给 0/1 个 element)
// - assigned_element_id 改派时,自动清空旧 slice 上的同 element 指派(保证唯一性)
// - assignSliceToElement 内部 = copy slice → assets-bin/{element-id}.png + 更新 manifest +
//   createOrUpdateAsset 元数据(向后兼容旧 asset.id == element.id 流向)

import { promises as fs } from 'node:fs'
import path from 'node:path'

import { DATA_ROOT, readJson, writeJson } from '@/lib/fs-utils'
import { createOrUpdateAsset } from '@/lib/assets'
import type { SliceManifest } from '@/lib/types'

export function sliceDirFor(stateId: string, category: string): string {
  return path.join(DATA_ROOT, 'slices', `${stateId}-${category}`)
}

export function slicePathFor(stateId: string, category: string, idx: number): string {
  return path.join(sliceDirFor(stateId, category), `${idx}.png`)
}

export function manifestPathFor(stateId: string, category: string): string {
  return path.join(sliceDirFor(stateId, category), 'manifest.json')
}

export async function writeSlice(
  stateId: string,
  category: string,
  idx: number,
  buffer: Buffer,
): Promise<void> {
  const dir = sliceDirFor(stateId, category)
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(slicePathFor(stateId, category, idx), buffer)
}

export async function readSlice(
  stateId: string,
  category: string,
  idx: number,
): Promise<Buffer | null> {
  try {
    return await fs.readFile(slicePathFor(stateId, category, idx))
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw e
  }
}

export async function listSlices(
  stateId: string,
  category: string,
): Promise<SliceManifest | null> {
  return readJson<SliceManifest>(manifestPathFor(stateId, category))
}

export async function saveManifest(
  stateId: string,
  category: string,
  manifest: SliceManifest,
): Promise<void> {
  await writeJson(manifestPathFor(stateId, category), manifest)
}

export type AssignSliceContext = {
  page_id: string
}

// 把 (state, category, sliceIdx) 指派给 elementId:
//   1. 读 manifest 校验 idx 合法
//   2. 读 slice 字节,写到 assets-bin/{elementId}.png
//   3. 更新 manifest:把 elementId 在其他 slice 上的旧 assigned_element_id 清掉,把目标 idx 设为 elementId
//   4. createOrUpdateAsset(向后兼容旧路径)
export async function assignSliceToElement(
  stateId: string,
  category: string,
  sliceIdx: number,
  elementId: string,
  ctx: AssignSliceContext,
): Promise<void> {
  const manifest = await listSlices(stateId, category)
  if (!manifest) throw new Error(`slice manifest 不存在:${stateId}/${category}`)

  const target = manifest.slices.find((s) => s.idx === sliceIdx)
  if (!target) throw new Error(`slice idx ${sliceIdx} 越界(共 ${manifest.slices.length} 个)`)

  const sliceBuf = await readSlice(stateId, category, sliceIdx)
  if (!sliceBuf) throw new Error(`slice file 不存在:${stateId}/${category}/${sliceIdx}.png`)

  // 写到 assets-bin/{elementId}.png(向后兼容)
  const binDir = path.join(DATA_ROOT, 'assets-bin')
  await fs.mkdir(binDir, { recursive: true })
  await fs.writeFile(path.join(binDir, `${elementId}.png`), sliceBuf)

  // 更新 manifest:清旧、设新
  for (const s of manifest.slices) {
    if (s.assigned_element_id === elementId && s.idx !== sliceIdx) {
      s.assigned_element_id = null
    }
  }
  target.assigned_element_id = elementId
  await saveManifest(stateId, category, manifest)

  // createOrUpdateAsset:复用旧路径,id == element_id
  await createOrUpdateAsset({
    id: elementId,
    element_id: elementId,
    page_id: ctx.page_id,
    width: target.width,
    height: target.height,
    alpha_quality: target.opaque_pct / 100,
  })
}
