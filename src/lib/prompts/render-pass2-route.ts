// HANDOFF §6.3.1 全量 Pass 2 模板(中文,会话式)。
// 措辞硬约束:严禁 pixel-faithfully / MUST / 直接出 transparent / 塞 entity_name+JSON。
// 用「参考图 #N」编号引用,不暴露 schema。

import type { LayoutElement, VisualCategory } from '../types'
import { VISUAL_CATEGORY_CN } from '../visual-category'

/**
 * 渲染某 category 路次的 Pass 2 prompt。
 * @param elements 该路 type=static 元素列表
 * @param pageDescription project.description ?? page.name
 */
export function renderPass2RoutePrompt(input: {
  category: VisualCategory
  elements: LayoutElement[]
  pageDescription: string
}): string {
  const { category, elements, pageDescription } = input
  const cn = VISUAL_CATEGORY_CN[category]

  const lines: string[] = []
  lines.push(
    `我们来尝试一下,把这张图(${pageDescription})里的${cn}类元素提取出来,单独放在一张鲜亮的纯绿色 #00FF00 背景画布上,作为后期抠像的绿幕。元素本身不要使用这个绿色。`,
  )
  lines.push('')
  lines.push(
    `第 1 张参考图是原图,展示了这些元素在画面里的整体样貌。后面的参考图是从原图取出的每个元素的特写,要画的就是这些:`,
  )
  lines.push('')
  // #2..#N+1 是 crop
  elements.forEach((el, i) => {
    const ref = i + 2
    const desc = (el.description || '').slice(0, 40)
    lines.push(`- 参考图 #${ref}:「${el.name}」${desc ? `(${desc})` : ''}`)
  })
  lines.push('')
  lines.push(
    `共 ${elements.length} 个元素,记得每个都画到。元素之间留出至少一整个元素宽度的空隙,宁可画布留白多也不要挤在一起。每个元素都要跟参考图里完全一致——保持原图的风格、颜色、文字内容,不要重新设计任何元素。`,
  )
  return lines.join('\n')
}

/**
 * re_extract 单元素重抠模板填充。
 * 模板从 config.prompts.pass2_extract 读(含 3 个占位符)。
 */
export function renderPass2ReExtract(input: {
  template: string
  pageDescription: string
  element: LayoutElement
}): string {
  const { template, pageDescription, element } = input
  const summary = `- ${element.name}${element.description ? `(${element.description.slice(0, 40)})` : ''}`
  return template
    .replaceAll('{{page_description}}', pageDescription)
    .replaceAll('{{element_summary}}', summary)
    .replaceAll('{{element_count}}', '1')
}

/** 多 element 的 element_summary 渲染(按 name 分组,HANDOFF §6.3.2) */
export function renderElementSummary(elements: LayoutElement[]): string {
  const byName = new Map<string, LayoutElement[]>()
  for (const el of elements) {
    let arr = byName.get(el.name)
    if (!arr) {
      arr = []
      byName.set(el.name, arr)
    }
    arr.push(el)
  }
  const lines: string[] = []
  for (const [name, arr] of byName) {
    if (arr.length === 1) {
      const desc = arr[0]!.description.slice(0, 40)
      lines.push(`- ${name}${desc ? `(${desc})` : ''}`)
    } else {
      const descs = arr.map((e) => e.description.slice(0, 40)).filter(Boolean).join(';')
      lines.push(`- ${name} 共 ${arr.length} 个${descs ? `(${descs})` : ''}`)
    }
  }
  return lines.join('\n')
}
