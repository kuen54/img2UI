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
    .raw()
    .toBuffer({ resolveWithObject: true })

  const { width, height, channels: ch } = info
  const out = Buffer.alloc(width * height * 4)

  for (let i = 0; i < width * height; i++) {
    const r = data[i * ch]!
    const g = data[i * ch + 1]!
    const b = data[i * ch + 2]!
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

    out[i * 4] = r
    out[i * 4 + 1] = outG
    out[i * 4 + 2] = b
    out[i * 4 + 3] = alpha
  }

  return sharp(out, { raw: { width, height, channels: 4 } })
    .png()
    .toBuffer()
}
