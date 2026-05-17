// HANDOFF 附录 A 逐字。5 路 Pass 1 prompt 渲染时拼到 over-include 头部
// + 用户 review 时按 category 分组。

import type { VisualCategory } from './types'

export { VISUAL_CATEGORY_PRIORITY } from './types'

export const ALL_VISUAL_CATEGORIES: readonly VisualCategory[] = [
  'subject',
  'button',
  'container',
  'background',
  'decoration',
  'other',
] as const

/** Pass 1 5 路并行只跑前 5 个,'other' 是 Pass 2 兜底分组 */
export const PASS1_ROUTES: readonly Exclude<VisualCategory, 'other'>[] = [
  'subject',
  'button',
  'container',
  'background',
  'decoration',
] as const

export const VISUAL_CATEGORY_DEFINITION_EN: Record<VisualCategory, string> = {
  subject: `**Subject** elements are the page's primary visual focus that carries identity:
- IP characters, mascots, 3D rendered figures
- Large artistic title text where typography IS the design (calligraphic seals, logo-like titles)
- Hero product images, main commodity photos
- Anything a viewer would describe as "the main thing on this page"`,
  button: `**Button** elements are interactive call-to-actions, typically with strong activity branding:
- Irregular-shaped action buttons with custom illustrations
- Buttons with complex materials (gradients, glows, glass effects)
- Activity-style buttons that feel "designed" rather than "default UI"`,
  container: `**Container** elements hold child content and need to flex with content size:
- 异形 frames with notches, holes, custom corner shapes
- Cards, tickets, badges that wrap text/images inside
- Section dividers / panel backgrounds that contain stuff`,
  background: `**Background** elements are the page's visual ambient layer:
- Full-page gradients
- Large color blocks
- Glow effects, halos, light beams
- Distant texture / pattern layers`,
  decoration: `**Decoration** elements are small graphical accents that add personality:
- Stars, sparkles, ribbons, confetti
- Highlight glints, small badges, sticker-like accents
- Fixed-text labels in decorative styling (small chips, tags, tiny stamps)`,
  other: `Anything that visually exists but doesn't fit the 5 categories above. Manual review will categorize.`,
}

export const VISUAL_CATEGORY_EXAMPLES_CN: Record<VisualCategory, string> = {
  subject:
    '主体类示例:奶茶盲盒卡通娃娃 / "幸运签"艺术字标题 / 主推杯子的 3D 渲染图',
  button:
    '按钮类示例:异形粉色「立即抽签」按钮 / 渐变金色「领取」按钮 / 带光晕的活动按钮',
  container:
    '容器类示例:粉色异形卡片框 / 票券形状的盲盒展示框 / 圆角矩形的内容卡片',
  background: '背景类示例:整页粉色渐变 / 中心光晕 / 大色块 / 远景纹理',
  decoration:
    '装饰类示例:小星星 / 彩带 / 高光闪烁 / "SUPER" 角标 / 小贴纸徽章 / "限定" 小标签',
  other: '其他:5 类都套不上的元素,人工 review 时归类',
}

export const VISUAL_CATEGORY_CN: Record<VisualCategory, string> = {
  subject: '主体',
  button: '按钮',
  container: '容器',
  background: '背景',
  decoration: '装饰',
  other: '其他',
}

/** Pass 1 over-include 头部里用,英文标题 */
export const VISUAL_CATEGORY_UPPER: Record<VisualCategory, string> = {
  subject: 'SUBJECT',
  button: 'BUTTON',
  container: 'CONTAINER',
  background: 'BACKGROUND',
  decoration: 'DECORATION',
  other: 'OTHER',
}
