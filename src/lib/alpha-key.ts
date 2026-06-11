// HANDOFF §8.1 chroma green key:绿幕 #00FF00 → 透明 RGBA
// 阈值实测最优:full_alpha=60 / full_opaque=25,spill suppression on

import sharp from 'sharp'

export interface ChromaKeyOptions {
  /** g_excess > 此值视为完全绿(α=0),默认 60 */
  full_alpha_threshold?: number
  /** g_excess < 此值视为完全不透明(α=255),默认 25 */
  full_opaque_threshold?: number
  /** 对 α>0 像素抑制绿溢:G_new = G - max(0, gExcess),默认 true */
  spill_suppression?: boolean
}

export async function chromaGreenKey(
  greenScreenPng: Buffer,
  opts: ChromaKeyOptions = {},
): Promise<Buffer> {
  const fullAlpha = opts.full_alpha_threshold ?? 60
  const fullOpaque = opts.full_opaque_threshold ?? 25
  const suppress = opts.spill_suppression ?? true

  const { data, info } = await sharp(greenScreenPng)
    .removeAlpha()
    // 显式钉死 sRGB 3 通道:生图素材本就是 sRGB,此处恒等(实测 bit 级不变);
    // 灰度/调色板等非常规 PNG 也会被规整成 sRGB 而不是走到下面的 throw
    .toColourspace('srgb')
    .raw()
    .toBuffer({ resolveWithObject: true })

  const { width, height, channels: ch } = info
  // removeAlpha + toColourspace('srgb') 后恒为 3 通道;此 throw 仅作断言,正常不可达
  if (ch !== 3) throw new Error(`chromaGreenKey expects 3 channels after removeAlpha, got ${ch}`)
  const N = width * height
  // 下方循环覆写 out 的全部 N*4 字节,allocUnsafe 免去清零
  const out = Buffer.allocUnsafe(N * 4)

  for (let i = 0; i < N; i++) {
    const p = i * 3
    const r = data[p]!
    const g = data[p + 1]!
    const b = data[p + 2]!
    const maxRB = r > b ? r : b
    const gExcess = g - maxRB

    let alpha: number
    if (gExcess >= fullAlpha) alpha = 0
    else if (gExcess <= fullOpaque) alpha = 255
    else {
      // fullOpaque..fullAlpha 线性映射 → 255..0
      alpha = Math.round((255 * (fullAlpha - gExcess)) / (fullAlpha - fullOpaque))
    }

    let outG = g
    if (suppress && alpha > 0 && gExcess > 0) {
      outG = Math.max(0, g - gExcess)
    }

    const o = i * 4
    out[o] = r
    out[o + 1] = outG
    out[o + 2] = b
    out[o + 3] = alpha
  }

  return sharp(out, { raw: { width, height, channels: 4 } })
    .png()
    .toBuffer()
}
