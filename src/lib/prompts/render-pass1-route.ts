// HANDOFF §5.3.2 over-include 头部模板逐字。
// 5 路 Pass 1 prompt 渲染时拼到 base prompt 之前。

import type { VisualCategory } from '../types'
import {
  VISUAL_CATEGORY_DEFINITION_EN,
  VISUAL_CATEGORY_EXAMPLES_CN,
  VISUAL_CATEGORY_UPPER,
  VISUAL_CATEGORY_CN,
} from '../visual-category'

/**
 * 拼 over-include 头部 + base prompt(系统消息内容)。
 * HANDOFF §5.3.2 模板逐字,$ 变量运行时替换。
 *
 * 措辞硬约束(违反必回归):
 * - 严禁 EXCLUSIVE 措辞(`Return ONLY` / `Do NOT return others`)
 * - 必须 over-include + IoU 合并
 */
export function renderPass1RoutePrompt(
  category: VisualCategory,
  basePrompt: string,
): string {
  const upper = VISUAL_CATEGORY_UPPER[category]
  const cn = VISUAL_CATEGORY_CN[category]
  const definition = VISUAL_CATEGORY_DEFINITION_EN[category]
  const examples = VISUAL_CATEGORY_EXAMPLES_CN[category]

  const header = `[${upper} PASS — OVER-INCLUDE MODE]

This pass focuses on ${cn} (${category}) elements.

${definition}

**OVER-INCLUDE PHILOSOPHY**:
- Be EXHAUSTIVE. **Better to over-include than to miss.**
- If you see ANY visual element that COULD plausibly be ${category}, return it. Even small/subtle ones. Even when borderline.
- Cross-route overlaps are FINE — downstream IoU merge handles dedup. We'd rather merge duplicates than miss elements.
- **Other passes also run. If you skip something thinking "decoration will handle it" but decoration also skips it thinking "subject will handle it", we lose the element.**
- So when in doubt, INCLUDE.

**Concrete examples of ${category} elements**:
${examples}

**BBox format**: \`[x, y, w, h]\` all NORMALIZED 0-1 floats. CONSTRAINT: \`x + w ≤ 1\` AND \`y + h ≤ 1\`. If an element extends to the right/bottom edge, set the start coord smaller (e.g. status bar across the top: \`[0, 0, 1.0, 0.04]\` not \`[1.0, 0, 0.04, 1.0]\`; full-width footer: \`[0, 0.96, 1.0, 0.04]\`).

For elements you do return, still classify each as \`static\` or \`code\` per the rules below.

---

`

  return header + basePrompt
}

/** Pass 1 user message 头部(每个 sub-run 都一致) */
export function renderPass1UserHeader(input: {
  pageName: string
  pageDescription?: string
  stateCount: number
}): string {
  return [
    `Page name: ${input.pageName}`,
    `Page description: ${input.pageDescription ?? '(no description)'}`,
    '',
    `States (${input.stateCount} total, canonical first):`,
  ].join('\n')
}

export const PASS1_USER_TAIL = `
Be EXHAUSTIVE per the OVER-INCLUDE PHILOSOPHY in the system prompt. Return JSON.`
