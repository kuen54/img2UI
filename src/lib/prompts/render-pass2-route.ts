// Phase 8c:Pass 2 按 visual_category 分组渲染 prompt + 编号引用 crop 参考图
// 参考图 #1 = 原图,#2..#N = 各 element 的 crop(顺序与 elements 数组一致)
// 措辞守门:会话式中文,不用 MUST / EXACTLY / pixel-faithfully(继承 v11 教训)

import type { Element } from '@/lib/types'
import { type VisualCategory, visualCategoryCn } from '@/lib/visual-category'

export function renderPass2RoutePrompt(
  category: VisualCategory,
  elements: Element[],
  pageDescription: string,
): string {
  if (elements.length === 0) throw new Error('renderPass2RoutePrompt: empty elements list')

  const cn = visualCategoryCn(category)
  // 编号从 #2 开始(参考图 #1 是原图)
  const lines = elements
    .map((el, i) => `- 参考图 #${i + 2}:「${el.name}」(${el.description})`)
    .join('\n')

  return `我们来尝试一下,把这张图(${pageDescription})里的${cn}类元素提取出来,单独放在一张鲜亮的纯绿色 #00FF00 背景画布上,作为后期抠像的绿幕。元素本身不要使用这个绿色。

第 1 张参考图是原图,展示了这些元素在画面里的整体样貌。后面的参考图是从原图取出的每个元素的特写,要画的就是这些:

${lines}

共 ${elements.length} 个元素,记得每个都画到。元素之间留出至少一整个元素宽度的空隙,宁可画布留白多也不要挤在一起。每个元素都要跟参考图里完全一致——保持原图的风格、颜色、文字内容,不要重新设计任何元素。`
}
