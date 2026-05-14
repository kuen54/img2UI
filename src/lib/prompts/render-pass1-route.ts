// Pass 1 多路:为某一 category 渲染 over-include prompt 头(PoC #2 v3 验证)
// 关键反面教训:不要写 "DO NOT return others" / "lean toward NOT returning"——
// PoC #2 v2 实测这种 EXCLUSIVE 措辞会让 model 在边界 case 普遍丢元素。
// 改为 over-include + 让下游 IoU 合并去重。
import {
  type VisualCategory,
  VISUAL_CATEGORY_DEFINITION_EN,
  VISUAL_CATEGORY_EXAMPLES_CN,
  visualCategoryCn,
} from '@/lib/visual-category'

export function renderPass1RoutePrompt(
  category: VisualCategory,
  basePrompt: string,
): string {
  const head = `[${category.toUpperCase()} PASS — OVER-INCLUDE MODE]

This pass focuses on ${visualCategoryCn(category)} (${category}) elements.

${VISUAL_CATEGORY_DEFINITION_EN[category]}

**OVER-INCLUDE PHILOSOPHY**:
- Be EXHAUSTIVE. **Better to over-include than to miss.**
- If you see ANY visual element that COULD plausibly be ${category}, return it. Even small/subtle ones. Even when borderline.
- Cross-route overlaps are FINE — downstream IoU merge handles dedup. We'd rather merge duplicates than miss elements.
- **Other passes also run. If you skip something thinking "decoration will handle it" but decoration also skips it thinking "subject will handle it", we lose the element.**
- So when in doubt, INCLUDE.

**Concrete examples of ${category} elements**:
${VISUAL_CATEGORY_EXAMPLES_CN[category]}

For elements you do return, still classify each as \`static\` or \`code\` per the rules below.

---

`
  return head + basePrompt
}
