// UI 渲染层术语收口:用户可见的「枚举 key → 中文 label」映射都放这里,
// 新增用户可见的枚举 label 一律加在这个文件,别在组件里散落本地映射。
// 只影响渲染文案 —— API 字段名 / 路由路径 / 数据 key 一概不动。
// (visual_category 的中文映射已有,见 visual-category.ts 的 VISUAL_CATEGORY_CN)

/** pipeline stepper 六阶段(顺序即 stepper 顺序) */
export const STAGE_ORDER = [
  'pass1',
  'element_review',
  'pass2',
  'asset_review',
  'validate',
  'export',
] as const

export type UiStage = (typeof STAGE_ORDER)[number]

export const STAGE_CN: Record<UiStage, string> = {
  pass1: '布局分析',
  element_review: '元素确认',
  pass2: '素材生成',
  asset_review: '素材指派',
  validate: '校验',
  export: '导出',
}

/** stepper 直接 map 用的有序 {key,label} 数组(替代组件里本地的 STAGE_LABELS) */
export const STAGES: ReadonlyArray<{ key: UiStage; label: string }> =
  STAGE_ORDER.map((key) => ({ key, label: STAGE_CN[key] }))

/** Element.type 枚举的用户可见 label */
export const ELEMENT_TYPE_CN: Record<'static' | 'code', string> = {
  static: '静态素材',
  code: '代码实现',
}
