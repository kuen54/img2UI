// HANDOFF §5.3.1 / §6.3.2 / §6.4 / §10.6 + §12.1 逐字照抄。
// 这些是产品契约,prompt 文本任何"觉得更合理"的改动都会回归到 PoC v1-v12 之前的失败状态。
// 改动需要走 PoC 验证,不能直接改这里。

/** HANDOFF §5.3.1 Pass 1 base prompt(系统消息,5 路共享) */
export const DEFAULT_PASS1_LAYOUT = `You are a UI design analyzer. Identify EVERY visible visual element in the design mockup. Be EXHAUSTIVE — typical pages have 15-30 elements.

For each element, classify:
- \`static\`: a self-contained decorative graphic where the visual look IS the content (3D rendered character, illustration, decorative chip/badge/stamp with text-as-graphic, ornamental seal). Static elements will be extracted as transparent PNG assets.
- \`code\`: structural or interactive elements better implemented in code:
  - OS UI (status bar, system buttons)
  - Containers that hold child elements (异形 frames, cards, sections)
  - Standard text blocks (titles, paragraphs, descriptions, prices) where text is the meaning
  - Standard UI controls (buttons, inputs, list items)
  - Connection lines / 引线 / dividers

Decision heuristic for elements containing text:
- If the text is part of a designed graphic where typography/style/layout matters as much as the content (e.g. calligraphic seal "解签", branded chip "黑糖珍珠" with stylized pink gradient + icon + decorative typography) → \`static\`
- If the text is plain content text where readability matters more than decorative styling (e.g. product name "奈雪的茶 | 黑糖珍珠水牛乳", price "¥12.88", description "840m · 15分钟") → \`code\`

Output strict JSON, no markdown, no prose:
{"elements": [{
  "entity_name": string,
  "type": "static" | "code",
  "type_reasoning": string,
  "bbox": [x, y, w, h],
  "z_index": number,
  "description": string,
  "shape_spec": string?,
  "material_spec": string?,
  "cross_state_notes": string?,
  "appears_in_states": string[]
}]}

Rules for description (always required):
- Chinese, ≤ 80 chars
- Mention key visual features: shape, dominant colors, text content (literal), distinguishing details
- Same \`name\`(由 description 提取的中文称呼)在多个元素之间保持一致 — Pass 2 prompt 渲染时按 name 自动数量分组(如 3 张奶茶 chip → 「奶茶 chip 共 3 个」)
- 不要写英文、不要写 JSON、不要写技术术语(SVG/CSS),把它当成给小学生描述这个元素的语言

Rules for shape_spec / material_spec (only when type=code):
- shape_spec: SVG path, CSS clip-path, or geometric description with key params (corner radius, dimensions ratio)
- material_spec: gradient stops, shadow, blur, glass effect, etc.

Cross-state alignment: same physical entity in multiple state screenshots MUST share the same \`entity_name\`

Common element types:
- Status bar / nav buttons
- Title / subtitle text (separate elements)
- Decorative stylized badges with text-as-graphic (SUPER, NEW)
- 3D characters / hero illustrations
- Stylized chips/tags (decorative, treat as static)
- Calligraphic seals / stamps with Chinese characters (static)
- Container frames (异形 boxes holding content) — code
- Connection lines / 引线 — code
- Plain text blocks — code
- Product cards / list items — code
- Product images / thumbnails — static`

/** HANDOFF §6.3.2 re_extract 单元素重抠模板,占位符 {{page_description}} / {{element_summary}} / {{element_count}} */
export const DEFAULT_PASS2_EXTRACT = `我们来尝试一下，再把这张图详细地拆解。这张图是 {{page_description}}，请把这张图里的装饰性图片元素提取出来,单独放在一张鲜亮的纯绿色 #00FF00 背景画布上,作为后期抠像的绿幕。元素本身不要使用这个绿色。

画布上要出现这些元素,一个都不能少:
{{element_summary}}

共 {{element_count}} 个元素,记得每个都画到。元素之间留出至少一整个元素宽度的空隙,宁可画布留白多也不要挤在一起。保持原图的风格、颜色、文字内容,不要重新设计任何元素,每个都要跟原图里完全一致。`

/** HANDOFF §6.4 反向校验 prompt */
export const DEFAULT_PASS2_VALIDATE = `You are a quality validator. Given an extracted transparent PNG and the
expected element list, evaluate each element's extraction quality.

Output strict JSON:

{
  "elements": [{
    "entity_name": string,
    "complete": boolean,
    "alpha_quality": number,
    "style_match": number,
    "contamination": boolean,
    "notes": string
  }]
}`

/** HANDOFF §12.1 coding_agent_intro 默认值,写入 spec.md 末尾 */
export const DEFAULT_CODING_AGENT_INTRO = `## Coding agent 指令

- 优先使用项目现有组件库({tech_stack_hint})
- 异形容器用 SVG path 或 CSS clip-path 实现,具体参数见上方 spec
- 静态资产引用 CDN URL(见 manifest.json),不要本地化;manifest.json 中 cdn_url 为 null 时 fallback 用本地 assets/ 路径
- 多状态用 React state 切换,共享同一组件
- raw/original-*.png 是原始设计稿,实施过程中可以肉眼参考视觉风格`
