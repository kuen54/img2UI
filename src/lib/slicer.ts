// 切片:基于 scipy.ndimage.binary_dilation + connected component
// 参考 ref/split_elements.py,纯 TS port

import sharp from 'sharp'

export type SliceOptions = {
  gap?: number              // binary_dilation 迭代次数,默认 15
  padding?: number          // bbox padding(像素),默认 5
  min_size?: number         // bbox 任一边 < min_size 视为噪点,默认 30
  min_opaque_pct?: number   // 二级过滤:bbox 内 opaque(α>200)像素 % 低于此值剔除,默认 1.0
  alpha_threshold?: number  // 视为前景的 alpha 阈值,默认 10
}

export type Slice = {
  buffer: Buffer
  bbox: [number, number, number, number]  // [x, y, w, h] 像素坐标
  opaque_pct: number
}

export async function sliceAssets(transparentPng: Buffer, opts: SliceOptions = {}): Promise<Slice[]> {
  const gap = opts.gap ?? 15
  const padding = opts.padding ?? 5
  const minSize = opts.min_size ?? 30
  const minOpaquePct = opts.min_opaque_pct ?? 1.0
  const alphaThreshold = opts.alpha_threshold ?? 10

  const { data, info } = await sharp(transparentPng).raw().toBuffer({ resolveWithObject: true })
  const { width, height, channels } = info
  if (channels !== 4) throw new Error('sliceAssets 需要 RGBA PNG 输入')

  // 1. 取 alpha mask
  const N = width * height
  const mask = new Uint8Array(N)  // 0/1
  for (let i = 0; i < N; i++) {
    mask[i] = data[i * 4 + 3]! > alphaThreshold ? 1 : 0
  }

  // 2. binary_dilation:8 邻接,gap 步
  const dilated = binaryDilate(mask, width, height, gap)

  // 3. connected component labeling(8 邻接,union-find)
  const labels = connectedComponents8(dilated, width, height)

  // 4. 每个 label 算 bbox(在 dilated mask 上)
  const bboxes = new Map<number, { minX: number; minY: number; maxX: number; maxY: number }>()
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const lbl = labels[y * width + x]!
      if (lbl === 0) continue
      const cur = bboxes.get(lbl)
      if (!cur) {
        bboxes.set(lbl, { minX: x, minY: y, maxX: x, maxY: y })
      } else {
        if (x < cur.minX) cur.minX = x
        if (x > cur.maxX) cur.maxX = x
        if (y < cur.minY) cur.minY = y
        if (y > cur.maxY) cur.maxY = y
      }
    }
  }

  // 5. 过滤 + 切图
  const slices: Slice[] = []
  for (const [, b] of bboxes) {
    let x = b.minX - padding
    let y = b.minY - padding
    let w = b.maxX - b.minX + 1 + padding * 2
    let h = b.maxY - b.minY + 1 + padding * 2
    if (x < 0) { w += x; x = 0 }
    if (y < 0) { h += y; y = 0 }
    if (x + w > width) w = width - x
    if (y + h > height) h = height - y
    if (w < minSize || h < minSize) continue

    // 算 bbox 内 opaque 像素 %(走原 mask,不是 dilated)
    let opaqueCount = 0
    for (let yy = y; yy < y + h; yy++) {
      for (let xx = x; xx < x + w; xx++) {
        if (data[(yy * width + xx) * 4 + 3]! > 200) opaqueCount++
      }
    }
    const opaquePct = (opaqueCount / (w * h)) * 100
    if (opaquePct < minOpaquePct) continue

    const buffer = await sharp(transparentPng).extract({ left: x, top: y, width: w, height: h }).png().toBuffer()
    slices.push({ buffer, bbox: [x, y, w, h], opaque_pct: opaquePct })
  }

  // 排序:y 中心 → x 中心(便于跟 elements 数组顺序对齐)
  slices.sort((a, b) => {
    const yCenterA = a.bbox[1] + a.bbox[3] / 2
    const yCenterB = b.bbox[1] + b.bbox[3] / 2
    if (Math.abs(yCenterA - yCenterB) > 50) return yCenterA - yCenterB
    return (a.bbox[0] + a.bbox[2] / 2) - (b.bbox[0] + b.bbox[2] / 2)
  })
  return slices
}

// 8 邻接膨胀,N 步
function binaryDilate(mask: Uint8Array, w: number, h: number, iters: number): Uint8Array {
  let cur = mask
  for (let it = 0; it < iters; it++) {
    const next = new Uint8Array(cur.length)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = y * w + x
        if (cur[idx] === 1) {
          next[idx] = 1
          continue
        }
        // 8 邻接看一圈
        let hit = 0
        for (let dy = -1; dy <= 1 && !hit; dy++) {
          for (let dx = -1; dx <= 1 && !hit; dx++) {
            const nx = x + dx
            const ny = y + dy
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
            if (cur[ny * w + nx] === 1) hit = 1
          }
        }
        next[idx] = hit
      }
    }
    cur = next
  }
  return cur
}

// connected component labeling(8 邻接,union-find)
function connectedComponents8(mask: Uint8Array, w: number, h: number): Int32Array {
  const labels = new Int32Array(mask.length)
  const parent: number[] = [0]  // index 0 reserved
  let nextLabel = 1

  const find = (x: number): number => {
    let r = x
    while (parent[r] !== r) r = parent[r]!
    // path compression
    while (parent[x] !== r) {
      const p = parent[x]!
      parent[x] = r
      x = p
    }
    return r
  }
  const union = (a: number, b: number) => {
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent[ra] = rb
  }

  // 第一遍:扫描,看左 / 上左 / 上 / 上右 邻居
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (mask[y * w + x] !== 1) continue
      const neighbors: number[] = []
      // 上排 (x-1, y-1) (x, y-1) (x+1, y-1)
      if (y > 0) {
        if (x > 0 && mask[(y - 1) * w + x - 1] === 1) neighbors.push(labels[(y - 1) * w + x - 1]!)
        if (mask[(y - 1) * w + x] === 1) neighbors.push(labels[(y - 1) * w + x]!)
        if (x < w - 1 && mask[(y - 1) * w + x + 1] === 1) neighbors.push(labels[(y - 1) * w + x + 1]!)
      }
      // 左 (x-1, y)
      if (x > 0 && mask[y * w + x - 1] === 1) neighbors.push(labels[y * w + x - 1]!)

      const filtered = neighbors.filter((l) => l > 0)
      if (filtered.length === 0) {
        labels[y * w + x] = nextLabel
        parent[nextLabel] = nextLabel
        nextLabel++
      } else {
        const minLabel = Math.min(...filtered)
        labels[y * w + x] = minLabel
        for (const l of filtered) if (l !== minLabel) union(l, minLabel)
      }
    }
  }

  // 第二遍:resolve labels
  const finalLabel = new Map<number, number>()
  let outLabel = 0
  for (let i = 0; i < labels.length; i++) {
    const l = labels[i]!
    if (l === 0) continue
    const root = find(l)
    let mapped = finalLabel.get(root)
    if (mapped === undefined) {
      outLabel++
      mapped = outLabel
      finalLabel.set(root, mapped)
    }
    labels[i] = mapped
  }
  return labels
}
