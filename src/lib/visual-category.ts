// 5 类视觉分类 + other 兜底
// PoC #2 v3 锁定:over-include + CATEGORY_EXAMPLES 中文物名锚定提升召回率
// 详细背景见 plan 2026-05-14-pass-multi-route-implementation.md § Phase 8b

export type VisualCategory =
  | 'subject' | 'button' | 'container'
  | 'background' | 'decoration' | 'other'

export const VISUAL_CATEGORIES: readonly VisualCategory[] = [
  'subject', 'button', 'container', 'background', 'decoration', 'other',
] as const

// 数字越小优先级越高,合并冲突时高优先级胜出
export const VISUAL_CATEGORY_PRIORITY: Record<VisualCategory, number> = {
  subject: 1, button: 2, container: 3,
  background: 4, decoration: 5, other: 6,
}

const CN_LABEL: Record<VisualCategory, string> = {
  subject: '主体', button: '按钮', container: '容器',
  background: '背景', decoration: '装饰', other: '其他',
}

export function visualCategoryCn(c: VisualCategory): string {
  return CN_LABEL[c]
}

// PoC #2 v3 锁定:CATEGORY_EXAMPLES 中文具体物名锚定,显著提升召回率
// 关键:decoration 类必须 mention 小文字标签徽章,救回 v2 漏的 auto_claim_badge 等
export const VISUAL_CATEGORY_EXAMPLES_CN: Record<VisualCategory, string> = {
  subject: 'IP 角色 / 3D 卡通娃娃 / 大艺术字标题(如「珍牛马」「你抽到的天选娃娃是」)/ 主商品图(实物渲染) / 主奖品图 / 联名 logo',
  button: '异形按钮 / 复杂材质按钮 / 强活动感 CTA / 抽奖按钮 / 开箱按钮 / 奖励领取按钮 / 带固定艺术字的按钮',
  container: '异形展示框(如奶茶盲盒页那个粉色异形外框)/ 卡片底图 / 票券 / 信封 / 卷轴 / 玻璃罩 / 奖励框 / 复杂列表卡片背景 / 承载文字的异形标签底板',
  background: '全页渐变背景 / 大色块 / 光晕 / 远景 / 纹理 / 氛围光 / 背景中的抽象波形 / 暗角',
  decoration: '星星 / 彩带 / 高光 / 粒子 / **小贴纸徽章包括「购买后自动领取」「完单可收藏潮玩」「HOT」「NEW」这类小文字标签** / 引线装饰 / 小光点 / 小箭头 / 角落贴纸 / 固定文案小标签',
  other: '5 类都套不上的兜底,人工 review 时归类',
}

// Pass 1 only-X prompt 头部用的完整定义文本(见 spec 附录 A)
export const VISUAL_CATEGORY_DEFINITION_EN: Record<VisualCategory, string> = {
  subject: `Main visual subject of the page — what users would mention when describing the page. Includes IP characters, mascots, hero illustrations, 3D renderings, key product/award images, AND artistic title typography (异形标题 / 艺术字 / 品牌字标 / 视觉化 slogan). Subject vs container: subject is the object being viewed, container is the structure holding it. Subject vs decoration: ask "would the user mention this when describing the page?" — if yes, subject.`,
  button: `Buttons that need image extraction because their styling/material/animation is too brand-specific to implement in code. Includes 异形 buttons, gamified buttons, sticker-style buttons, skeuomorphic, complex gradient, scan-light effects, 3D thickness, material textures, fixed 艺术字 buttons, reward/lottery/unbox CTAs. EXCLUDES standard buttons (rounded rect, capsule, plain icon button, OS-default tab/nav).`,
  container: `Special visual containers holding content/info/subjects, that cannot be reproduced by standard code components. Includes 异形 boxes, stages, display cases, 异形 dialogs, irregular cards, tickets, scrolls, certificates, glass domes, packaging boxes, reward frames, complex list-card backgrounds, scene platforms. EXCLUDES standard rounded cards, plain dialogs, plain buttons. Special: 胶囊/气泡/徽章 carrying dynamic content → container; if fixed-content sticker → decoration.`,
  background: `Underlying visual environment that remains after removing all UI/subjects/containers/decorations. Includes gradients, glow, textures, large color blocks, ambient light, noise, abstract waves, distant scenery, vignette, soft light, sky/clouds/grass/distant city. EXCLUDES anything carrying interactive purpose, anything reusable as standalone sticker, anything in foreground.`,
  decoration: `Small decorative assets that don't carry core info but boost atmosphere/精致度. Includes stars, ribbons, highlights, particles, capsules, bubbles, badges, confetti, hearts, clouds, small flowers, light dots, lightning, small arrows, stamps, fire, coins, gems, sparkles, corner stickers, foreground blur, scan-light layers, glowing strokes. **Critical: small text-label stickers (e.g. fixed "购买后自动领取" / "完单可收藏潮玩" / "HOT" / "NEW" stickers) ALSO belong here.** Special rule: 胶囊/气泡/徽章 with FIXED content → decoration. With dynamic content → container.`,
  other: `Catch-all for anything that doesn't fit the 5 categories. Reviewer will manually re-categorize if needed.`,
}
