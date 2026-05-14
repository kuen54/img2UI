// chroma green key:输入绿幕 #00FF00 背景的 PNG,输出透明背景的 RGBA PNG
// 算法(SPEC § 抠图算法 / CLAUDE.md § 反直觉强约束 § 7):
//   g_excess = G - max(R, B)
//   g_excess > full_alpha_threshold(60)  → α=0(完全透明)
//   g_excess < full_opaque_threshold(25) → α=255(完全不透明)
//   中间                                  → 线性插值
//   对 α>0 像素做 spill suppression:G_new = G - max(0, g_excess)

import sharp from 'sharp'

export type ChromaKeyOptions = {
  full_alpha_threshold?: number    // 默认 60
  full_opaque_threshold?: number   // 默认 25
  spill_suppression?: boolean      // 默认 true
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

  const { width, height } = info
  const inChannels = info.channels  // 3(RGB)
  const outBuf = Buffer.alloc(width * height * 4)  // RGBA

  for (let i = 0; i < width * height; i++) {
    const r = data[i * inChannels]!
    const g = data[i * inChannels + 1]!
    const b = data[i * inChannels + 2]!
    const maxRB = r > b ? r : b
    const gExcess = g - maxRB

    let alpha: number
    if (gExcess >= fullAlpha) alpha = 0
    else if (gExcess <= fullOpaque) alpha = 255
    else {
      // 线性插值:fullOpaque..fullAlpha 映射到 255..0
      alpha = Math.round(255 * (fullAlpha - gExcess) / (fullAlpha - fullOpaque))
    }

    let outG = g
    if (suppress && alpha > 0 && gExcess > 0) {
      outG = Math.max(0, g - gExcess)
    }

    outBuf[i * 4] = r
    outBuf[i * 4 + 1] = outG
    outBuf[i * 4 + 2] = b
    outBuf[i * 4 + 3] = alpha
  }

  return await sharp(outBuf, { raw: { width, height, channels: 4 } }).png().toBuffer()
}
