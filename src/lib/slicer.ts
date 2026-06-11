// HANDOFF §9 + ref/split_elements.py 算法移植到 TS。
// 不引 OpenCV/scipy:binary_dilation 8-connectivity 自实现 + connected-component union-find 自实现。

import sharp from 'sharp'

export interface SliceOptions {
  /** dilation 迭代次数(桥接同元素内部小断裂),默认 15 */
  gap?: number
  /** 每个连通块 bbox padding 像素,默认 5 */
  padding?: number
  /** bbox 任一边 < min_size 视为噪点过滤,默认 30 */
  min_size?: number
  /** bbox 内 opaque(α>200)像素百分比 < 此值过滤(微弱半透残留),默认 1.0 */
  min_opaque_pct?: number
  /** alpha mask 阈值,默认 10 */
  alpha_threshold?: number
}

export interface Slice {
  buffer: Buffer
  /** 像素坐标 [x, y, w, h] */
  bbox: [number, number, number, number]
  /** 0-100 */
  opaque_pct: number
  width: number
  height: number
}

export async function sliceAssets(
  transparentPng: Buffer,
  opts: SliceOptions = {},
): Promise<Slice[]> {
  const gap = opts.gap ?? 15
  const padding = opts.padding ?? 5
  const minSize = opts.min_size ?? 30
  const minOpaquePct = opts.min_opaque_pct ?? 1.0
  const alphaT = opts.alpha_threshold ?? 10

  const { data, info } = await sharp(transparentPng)
    .raw()
    .toBuffer({ resolveWithObject: true })
  const { width: W, height: H, channels: ch } = info
  if (ch !== 4) throw new Error('sliceAssets needs RGBA')

  // Step 1: alpha mask
  const N = W * H
  const mask = new Uint8Array(N)
  for (let i = 0; i < N; i++) {
    mask[i] = data[i * 4 + 3]! > alphaT ? 1 : 0
  }

  // Step 2: binary_dilation (8-connectivity, gap iterations)
  const dilated = binaryDilate8(mask, W, H, gap)

  // Step 3: connected component labeling (8-connectivity, two-pass union-find)
  const labels = ccLabel8(dilated, W, H)

  // Step 4: per-label bbox
  const bboxes = new Map<number, { x0: number; y0: number; x1: number; y1: number }>()
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const l = labels[y * W + x]!
      if (l === 0) continue
      const b = bboxes.get(l)
      if (!b) {
        bboxes.set(l, { x0: x, y0: y, x1: x, y1: y })
      } else {
        if (x < b.x0) b.x0 = x
        if (x > b.x1) b.x1 = x
        if (y < b.y0) b.y0 = y
        if (y > b.y1) b.y1 = y
      }
    }
  }

  // Step 5: filter + crop
  const slices: Slice[] = []
  for (const b of bboxes.values()) {
    let x = b.x0 - padding
    let y = b.y0 - padding
    let w = b.x1 - b.x0 + 1 + padding * 2
    let h = b.y1 - b.y0 + 1 + padding * 2
    if (x < 0) { w += x; x = 0 }
    if (y < 0) { h += y; y = 0 }
    if (x + w > W) w = W - x
    if (y + h > H) h = H - y
    if (w < minSize || h < minSize) continue

    // opaque% 在原 mask(非 dilated)上算
    let opaque = 0
    for (let yy = y; yy < y + h; yy++) {
      for (let xx = x; xx < x + w; xx++) {
        if (data[(yy * W + xx) * 4 + 3]! > 200) opaque++
      }
    }
    const pct = (opaque / (w * h)) * 100
    if (pct < minOpaquePct) continue

    // crop 直接从开头那次 raw 解码的 RGBA buf 按行拷贝(避免每切片重复 full-decode),
    // 像素与 sharp.extract 等价:同一 PNG 解码结果的同一矩形区域
    const rowBytes = w * 4
    const cropBuf = Buffer.allocUnsafe(h * rowBytes)
    for (let yy = 0; yy < h; yy++) {
      const srcStart = ((y + yy) * W + x) * 4
      data.copy(cropBuf, yy * rowBytes, srcStart, srcStart + rowBytes)
    }
    const buffer = await sharp(cropBuf, { raw: { width: w, height: h, channels: 4 } })
      .png()
      .toBuffer()
    slices.push({ buffer, bbox: [x, y, w, h], opaque_pct: pct, width: w, height: h })
  }

  // 排序:按 y 中心 → x 中心(便于跟 element 顺序大致对齐)
  slices.sort((a, b) => {
    const ay = a.bbox[1] + a.bbox[3] / 2
    const by = b.bbox[1] + b.bbox[3] / 2
    if (Math.abs(ay - by) > 50) return ay - by
    const ax = a.bbox[0] + a.bbox[2] / 2
    const bx = b.bbox[0] + b.bbox[2] / 2
    return ax - bx
  })
  return slices
}

// ─── 8-connectivity binary dilation ────────────────────────────────────────

// 等价性依据:8-connectivity dilation 的结构元是 3×3 方形 B,
// B = H ⊕ V(H={(-1,0),(0,0),(1,0)},V={(0,-1),(0,0),(0,1)} 的 Minkowski 和恰为 3×3 方形),
// dilation 满足结合律:A ⊕ B = (A ⊕ H) ⊕ V,故先行后列两趟 1×3 与一趟 3×3 逐像素结果相同。
// 边界:两种写法都把图外视为 0;纵向趟只在本列内取 y±1,横向中间结果只需图内值,裁剪不丢信息。
// buffer 策略:tmp(横向结果)/ buf(纵向结果)两块来回复用,每迭代不再新分配。
function binaryDilate8(mask: Uint8Array, W: number, H: number, iters: number): Uint8Array {
  if (iters <= 0) return mask
  const N = W * H
  const tmp = new Uint8Array(N)
  const buf = new Uint8Array(N)
  let src: Uint8Array = mask
  for (let it = 0; it < iters; it++) {
    // 横向趟:src → tmp(每像素看 x-1 / x / x+1)
    for (let y = 0; y < H; y++) {
      const row = y * W
      for (let x = 0; x < W; x++) {
        const i = row + x
        tmp[i] =
          src[i] === 1 || (x > 0 && src[i - 1] === 1) || (x < W - 1 && src[i + 1] === 1)
            ? 1
            : 0
      }
    }
    // 纵向趟:tmp → buf(每像素看 y-1 / y / y+1;buf 全量覆写,旧内容无需清零)
    for (let y = 0; y < H; y++) {
      const row = y * W
      for (let x = 0; x < W; x++) {
        const i = row + x
        buf[i] =
          tmp[i] === 1 || (y > 0 && tmp[i - W] === 1) || (y < H - 1 && tmp[i + W] === 1)
            ? 1
            : 0
      }
    }
    src = buf
  }
  return buf
}

// ─── 8-connectivity connected component labeling (union-find, two pass) ───

function ccLabel8(mask: Uint8Array, W: number, H: number): Int32Array {
  const labels = new Int32Array(mask.length)
  const parent: number[] = [0] // 0 reserved
  let next = 1

  const find = (x: number): number => {
    let r = x
    while (parent[r] !== r) r = parent[r]!
    while (parent[x] !== r) {
      const p = parent[x]!
      parent[x] = r
      x = p
    }
    return r
  }
  const union = (a: number, b: number): void => {
    const ra = find(a), rb = find(b)
    if (ra !== rb) parent[ra] = rb
  }

  // Pass 1: scan, look at NW / N / NE / W neighbors
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (mask[y * W + x] !== 1) continue
      const ns: number[] = []
      if (y > 0) {
        if (x > 0 && mask[(y - 1) * W + x - 1] === 1) ns.push(labels[(y - 1) * W + x - 1]!)
        if (mask[(y - 1) * W + x] === 1) ns.push(labels[(y - 1) * W + x]!)
        if (x < W - 1 && mask[(y - 1) * W + x + 1] === 1)
          ns.push(labels[(y - 1) * W + x + 1]!)
      }
      if (x > 0 && mask[y * W + x - 1] === 1) ns.push(labels[y * W + x - 1]!)
      const valid = ns.filter((l) => l > 0)
      if (valid.length === 0) {
        labels[y * W + x] = next
        parent[next] = next
        next++
      } else {
        const min = Math.min(...valid)
        labels[y * W + x] = min
        for (const l of valid) if (l !== min) union(l, min)
      }
    }
  }

  // Pass 2: resolve to compact final labels
  const final = new Map<number, number>()
  let out = 0
  for (let i = 0; i < labels.length; i++) {
    const l = labels[i]!
    if (l === 0) continue
    const root = find(l)
    let mapped = final.get(root)
    if (mapped === undefined) {
      out++
      mapped = out
      final.set(root, mapped)
    }
    labels[i] = mapped
  }
  return labels
}
