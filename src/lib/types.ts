// 数据 schema — 跟 SPEC.md § 数据 schema 完全一致
// 改这份必须同步改 SPEC.md(参见 AGENTS.md § 8 文档同步规则)

import type { VisualCategory } from '@/lib/visual-category'

// 重新导出 VisualCategory,方便消费方从 types 一次性引入
export type { VisualCategory } from '@/lib/visual-category'

// =============================================================================
// Provider 与 Config
// =============================================================================

export type ProviderKind = 'mllm' | 'image_gen' | 'cdn' | 'matting'
export type ApiFormat = 'openai' | 'anthropic' | 'apimart' | 'sankuai' | 's3' | 'koukoutu'

export type ProviderConfig = {
  id: string                       // nanoid(6),前缀 prv_
  kind: ProviderKind
  name: string                     // 用户给的展示名
  api_format: ApiFormat
  base_url: string
  api_key: string                  // 服务端持久化明文,GET 时遮罩

  // for kind=mllm | image_gen
  model?: string

  // for kind=mllm
  default_temperature?: number
  default_max_tokens?: number
  vision_capable?: boolean         // 必须 true 才能用作 mllm

  // for kind=image_gen
  endpoint_kind?: 'image_edit' | 'image_generation'
  is_async?: boolean
  poll_interval_seconds?: number
  poll_initial_delay_seconds?: number
  poll_max_attempts?: number
  default_quality?: 'low' | 'medium' | 'high'

  // for kind=cdn
  bucket?: string
  region?: string
  public_url_prefix?: string

  active?: boolean
  created_at: string
  updated_at: string
}

export type AppConfig = {
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

// =============================================================================
// Project / Page / State
// =============================================================================

export type Project = {
  id: string                       // nanoid(8),前缀 proj_
  name: string
  description?: string
  tech_stack_hint?: string
  cdn_provider_id?: string
  created_at: string
  updated_at: string
  // API decorated(GET 时附加,不持久化)
  sample_thumbnail_url?: string    // Phase 8e:取项目下第一个有缩略图的 page
}

export type Page = {
  id: string                       // nanoid(8),前缀 page_
  project_id: string
  name: string
  route_hint?: string
  canonical_state_id: string
  thumbnail_path?: string          // data/thumbs/{page-id}.png,canonical state 上传后填(Phase 8e)
  created_at: string
  updated_at: string
  // API decorated(GET 时附加,不持久化)
  thumbnail_url?: string           // Phase 8e:thumbnail_path 存在时填 /api/thumbs/{pageId}
}

export type StatePipelineStatus =
  | 'idle'
  | 'pass1_running' | 'pass1_done' | 'pass1_failed'
  | 'pass2_running' | 'pass2_done' | 'pass2_failed'
  | 'validating' | 'validated'

export type State = {
  id: string                       // nanoid(8),前缀 state_
  page_id: string
  name: string
  original_image_path: string      // data/raw/{state-id}.png
  width: number
  height: number
  pipeline_status: StatePipelineStatus
  pass1_run_id?: string
  pass2_run_id?: string
  created_at: string
}

// =============================================================================
// Element / Asset
// =============================================================================

export type Element = {
  id: string                       // nanoid(8),前缀 el_;跨状态对齐:同 entity 同 id
  page_id: string
  state_ids: string[]
  name: string
  type: 'static' | 'code'
  visual_category: VisualCategory  // 新增,Pass 1 输出(Phase 8b)
  bbox: [number, number, number, number]   // canonical 原图归一化坐标 [x,y,w,h] ∈ [0,1]
  z_index: number
  description: string              // for coding agent + Pass 2 prompt 渲染源, ≤ 80 字

  // type=code 才有
  shape_spec?: string
  material_spec?: string

  cross_state_notes?: string
  pass1_routes_seen?: string[]     // 新增,debug:此 element 在哪几路 Pass 1 中被识别(Phase 8b)
  reviewed: boolean
  created_at: string
  updated_at: string
}

export type AssetStatus = 'extracted' | 'validated' | 'uploaded' | 'failed'

export type Asset = {
  id: string                       // 与 element.id 一致
  element_id: string
  page_id: string
  local_path: string               // data/assets-bin/{asset-id}.png
  cdn_url?: string
  width: number
  height: number
  alpha_quality: number            // 0-1
  validation_notes?: string
  status: AssetStatus
  created_at: string
  updated_at: string
}

// =============================================================================
// PipelineRun
// =============================================================================

export type PipelinePassKind =
  | 'pass1' | 'pass1_subject' | 'pass1_button' | 'pass1_container'
  | 'pass1_background' | 'pass1_decoration'
  | 'pass2' | 'pass2_subject' | 'pass2_button' | 'pass2_container'
  | 'pass2_background' | 'pass2_decoration' | 'pass2_other'
  | 'validate' | 're_extract'

export type PipelineRun = {
  id: string                       // nanoid(8),前缀 run_
  state_id: string
  pass: PipelinePassKind
  status: 'running' | 'completed' | 'failed'
  started_at: string
  completed_at?: string

  llm_request: {
    provider_id: string
    model: string
    prompt: string                 // 实际发出的 prompt(展开变量后)
    images: string[]               // 输入图片的本地路径或 base64 sha256
    extra: Record<string, unknown> // 其他参数(temperature, max_tokens 等)
  }
  llm_response: Record<string, unknown>
  parsed_result?: Record<string, unknown>
  error?: { code: string; message: string; retryable: boolean }
}
