// 生成回归测试用图:设计稿 + 各路绿幕(mock image_gen 的返回素材)
// 用法:node scripts/regress/gen-images.mjs <输出目录>
import sharp from 'sharp'

const outDir = process.argv[2]
if (!outDir) {
  console.error('usage: node gen-images.mjs <out-dir>')
  process.exit(1)
}

const SQ = 123 // 0.12 × 1024,对应 canned bbox [_, _, 0.12, 0.12]

function canvas(bg) {
  return sharp({
    create: { width: 1024, height: 1024, channels: 3, background: bg },
  }).png()
}
function square(color) {
  return sharp({
    create: { width: SQ, height: SQ, channels: 3, background: color },
  })
    .png()
    .toBuffer()
}

const red = await square({ r: 220, g: 30, b: 40 })
const blue = await square({ r: 30, g: 60, b: 220 })
const GREEN = { r: 0, g: 255, b: 0 }

// 设计稿:白底 + 红方块(102,102)+ 蓝方块(512,512)
// 位置对应 Pass 1 canned bbox:红 [0.1,0.1,0.12,0.12] / 蓝 [0.5,0.5,0.12,0.12]
await canvas({ r: 255, g: 255, b: 255 })
  .composite([
    { input: red, left: 102, top: 102 },
    { input: blue, left: 512, top: 512 },
  ])
  .toFile(`${outDir}/design.png`)

// 绿幕:subject 路(红)/ button 路(蓝)/ 兜底(both)
await canvas(GREEN)
  .composite([{ input: red, left: 102, top: 102 }])
  .toFile(`${outDir}/green-subject.png`)
await canvas(GREEN)
  .composite([{ input: blue, left: 512, top: 512 }])
  .toFile(`${outDir}/green-button.png`)
await canvas(GREEN)
  .composite([
    { input: red, left: 102, top: 102 },
    { input: blue, left: 512, top: 512 },
  ])
  .toFile(`${outDir}/green-both.png`)

console.log(`test images -> ${outDir}`)
