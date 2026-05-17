// HANDOFF §3 全部数据类型(逐字对应,带 MVP §0.4 偏离)
// 命名:`Element` 与 DOM 全局冲突,改名 `LayoutElement`

// ─── §3.1 Provider + AppConfig ──────────────────────────────────────────────

export type ProviderKind = 'mllm' | 'image_gen' | 'cdn' | 'matting'

export type ApiFormat =
  | 'openai'
  | 'anthropic'
  | 'apimart'
  | 'sankuai'
  | 's3'
  | 'koukoutu'

export interface ProviderConfig {
  id: string
  kind: ProviderKind
  name: string
  api_format: ApiFormat
  base_url: string
  /** 服务端持久化明文,GET 时遮罩 */
  api_key: string
  /** mllm | image_gen 才有 */
  model?: string
  // mllm
  default_temperature?: number
  default_max_tokens?: number
  vision_capable?: boolean
  // image_gen
  endpoint_kind?: 'image_edit' | 'image_generation'
  is_async?: boolean
  poll_interval_seconds?: number
  poll_initial_delay_seconds?: number
  poll_max_attempts?: number
  default_quality?: 'low' | 'medium' | 'high'
  // cdn
  bucket?: string
  region?: string
  public_url_prefix?: string
  /** S3 用:Access Key ID(api_key 字段存 Secret Access Key) */
  access_key_id?: string
  // 状态
  active?: boolean
  created_at: string
  updated_at: string
}

export interface AppConfig {
  /** schema 版本号,启动时检测做迁移 */
  version: string
  providers: ProviderConfig[]
  prompts: {
    pass1_layout: string
    pass2_extract: string
    pass2_validate: string
    coding_agent_intro: string
  }
  settings: {
    auto_run_pass1_on_upload: boolean
    auto_run_validation_after_pass2: boolean
    default_export_dir: string
  }
}

// ─── §3.2 Project / Page / State ────────────────────────────────────────────

export interface Project {
  id: string
  name: string
  description?: string
  /** "Next.js + Tailwind + shadcn" 之类的 hint,写进 spec.md */
  tech_stack_hint?: string
  /** 覆盖默认 CDN */
  cdn_provider_id?: string
  created_at: string
  updated_at: string
}

export interface Page {
  id: string
  project_id: string
  /** "抽中页" */
  name: string
  /** "/lottery/result" */
  route_hint?: string
  /** 默认状态 id;MVP S1 单 state per page,这就是唯一的 state */
  canonical_state_id: string
  created_at: string
  updated_at: string
}

export type StatePipelineStatus =
  | 'idle'
  | 'pass1_running'
  | 'pass1_done'
  | 'pass1_failed'
  | 'pass2_running'
  | 'pass2_done'
  | 'pass2_failed'
  | 'validating'
  | 'validated'

export interface StateRecord {
  id: string
  page_id: string
  /** "canonical" / "hover" / "empty";MVP S1 单 state 时固定 "canonical" */
  name: string
  /** data/raw/{state-id}.png */
  original_image_path: string
  width: number
  height: number
  pipeline_status: StatePipelineStatus
  pass1_run_id?: string
  pass2_run_id?: string
  validate_run_id?: string
  created_at: string
}

// ─── §3.3 Element / Asset ───────────────────────────────────────────────────

export type VisualCategory =
  | 'subject'
  | 'button'
  | 'container'
  | 'background'
  | 'decoration'
  | 'other'

/** IoU 合并冲突时高优先级胜出(数字越小越优先) */
export const VISUAL_CATEGORY_PRIORITY: Record<VisualCategory, number> = {
  subject: 1,
  button: 2,
  container: 3,
  background: 4,
  decoration: 5,
  other: 6,
}

export type ElementType = 'static' | 'code'

/** 归一化 bbox [x, y, w, h] ∈ [0, 1] */
export type BBox = readonly [number, number, number, number]

export interface LayoutElement {
  id: string
  page_id: string
  /** MVP S1 永远 = [page.canonical_state_id] */
  state_ids: string[]
  /** "卡通娃娃" */
  name: string
  type: ElementType
  visual_category: VisualCategory
  bbox: BBox
  z_index: number
  /** 中文 ≤ 80 字 */
  description: string
  /** type=code 才有 */
  shape_spec?: string
  /** type=code 才有 */
  material_spec?: string
  cross_state_notes?: string
  /** debug:此 element 在哪几路 Pass 1 中被识别 */
  pass1_routes_seen?: string[]
  reviewed: boolean
  created_at: string
  updated_at: string
}

export type AssetStatus = 'extracted' | 'validated' | 'uploaded' | 'failed'

/** MVP S3:切片来源,放进 Asset 自身,无独立 SliceManifest */
export interface SliceSource {
  state_id: string
  category: VisualCategory
  idx: number
}

export interface Asset {
  /** 与 element.id 一致 */
  id: string
  element_id: string
  page_id: string
  /** data/assets-bin/{asset-id}.png */
  local_path: string
  cdn_url?: string
  width: number
  height: number
  /** 0-1 */
  alpha_quality: number
  validation_notes?: string
  status: AssetStatus
  /** MVP S3:指派关系存这里,无独立 manifest */
  slice_source?: SliceSource
  created_at: string
  updated_at: string
}

// ─── §3.4 切片(MVP S3 简化:无 SliceManifest 文件) ──────────────────────────

export interface SliceInfo {
  state_id: string
  category: VisualCategory
  idx: number
  /** 文件相对路径 data/slices/{state}-{cat}/{idx}.png */
  path: string
  width: number
  height: number
  /** 0-100 */
  opaque_pct: number
}

// ─── §3.5 PipelineRun ───────────────────────────────────────────────────────

export type PipelinePassKind =
  | 'pass1' // 总 audit 入口
  | 'pass1_subject'
  | 'pass1_button'
  | 'pass1_container'
  | 'pass1_background'
  | 'pass1_decoration'
  | 'pass2' // 总 audit 入口
  | 'pass2_subject'
  | 'pass2_button'
  | 'pass2_container'
  | 'pass2_background'
  | 'pass2_decoration'
  | 'pass2_other'
  | 'validate'
  | 're_extract'

export interface PipelineRunError {
  code: string
  message: string
  retryable: boolean
}

export interface LlmRequestSpec {
  provider_id: string
  model: string
  /** 实际发出的 prompt(展开变量后) */
  prompt: string
  /** 输入图片的本地路径或 base64 sha256 */
  images: string[]
  extra: Record<string, unknown>
}

export interface PipelineRun {
  id: string
  state_id: string
  pass: PipelinePassKind
  status: 'running' | 'completed' | 'failed'
  started_at: string
  completed_at?: string
  llm_request: LlmRequestSpec
  /** 原始返回值,留底 */
  llm_response: unknown
  parsed_result?: unknown
  error?: PipelineRunError
}

// ─── 工具类型 ────────────────────────────────────────────────────────────────

export type Brand<T, B> = T & { __brand: B }
export type IsoDateTime = Brand<string, 'IsoDateTime'>
