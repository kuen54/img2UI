# img2UI SPEC

> 技术契约文档。配套 [PRD.md](./PRD.md) 食用。本文档只描述「怎么实现/怎么对接」,不论证「为什么这么做」

---

## 整体架构

```
┌─────────────────────────────────────────────────────────────┐
│  Browser (localhost:3000)                                   │
│  Next.js App Router (React 19, TypeScript strict)           │
│  shadcn v4 + Tailwind v4 + sonner + base-ui                 │
└──────────────────────┬──────────────────────────────────────┘
                       │ HTTP (Same-origin, CSRF-gated)
┌──────────────────────▼──────────────────────────────────────┐
│  Next.js Route Handlers (/api/*)                            │
│  ├─ /api/config      provider configs / CDN / prompts       │
│  ├─ /api/projects    /pages /states                         │
│  ├─ /api/pipeline    Pass1 / Pass2 / slice / validate       │
│  ├─ /api/assets      upload to CDN / retry single           │
│  └─ /api/export      generate folder/zip                    │
└──────────────────────┬──────────────────────────────────────┘
                       │
            ┌──────────┴──────────┐
            ▼                     ▼
   ┌─────────────────┐    ┌─────────────────┐
   │ External APIs   │    │ Local FS        │
   │ - MLLM (gemini) │    │ data/           │
   │ - ImageGen      │    │  ├─ config.json │
   │   (image-2)     │    │  ├─ projects/   │
   │ - CDN (S3)      │    │  ├─ pages/      │
   └─────────────────┘    │  ├─ states/     │
                          │  ├─ pipelines/  │
                          │  ├─ raw/        │
                          │  └─ assets/     │
                          └─────────────────┘
```

**关键约束**:
- 单进程 Next.js,**无独立后端**。所有外部 API 调用从 Route Handler 发起,API key 在服务端持久化,前端永远只看遮罩值
- 数据持久化只用文件系统 JSON,无数据库。所有写操作走 `writeAtomic`(tmp + rename)
- CSRF gate 用 `Sec-Fetch-Site` 头,只接受同源请求(localhost-only 工具)

---

## 数据 schema

### Provider 与 Config

```ts
// kind 决定字段子集和 UI 展示分组
type ProviderKind = 'mllm' | 'image_gen' | 'cdn'
type ApiFormat = 'openai' | 'anthropic' | 'apimart' | 'sankuai' | 's3'

type ProviderConfig = {
  id: string                       // nanoid(6)
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
  endpoint_kind?: 'image_edit' | 'image_generation'  // URL 端点形式:'image_generation' = POST /images/generations(apimart 异步 + OpenAI 文本生图);'image_edit' = POST /images/edits(OpenAI 直连真正的 image-to-image)。两种 endpoint 都可接受 image_urls 做 image-to-image,字段反映的是 URL 路径不是语义
  is_async?: boolean               // true: submit + poll(apimart 模式),false: sync(OpenAI 直连模式)
  poll_interval_seconds?: number   // is_async=true 时,轮询间隔,默认 5
  poll_initial_delay_seconds?: number  // is_async=true 时,首次轮询前等待,默认 12
  poll_max_attempts?: number       // is_async=true 时,最大轮询次数,默认 60(总等待 ~5 分钟兜底,Phase 8f BUG #2 调高:实测 image_gen 单次 ~150-220s+,4 路并发拥挤)
  default_quality?: 'low' | 'medium' | 'high'  // gpt-image-2-official 必须 'high',否则文字乱码

  // for kind=cdn
  bucket?: string
  region?: string
  public_url_prefix?: string       // 完整 URL 前缀,如 https://cdn.foo.com/img2ui/

  active?: boolean                 // 同 kind 下唯一 active=true
  created_at: string
  updated_at: string
}

type AppConfig = {
  version: string                  // schema 版本号,如 "0.1.0",启动时检测做迁移
  providers: ProviderConfig[]
  prompts: {
    pass1_layout: string           // 模板,见下文 prompt 章节
    pass2_extract: string
    pass2_validate: string
    coding_agent_intro: string     // 写入 spec.md 顶部
  }
  settings: {
    auto_run_pass1_on_upload: boolean    // 默认 true
    auto_run_validation_after_pass2: boolean  // 默认 true
    default_export_dir: string     // 默认 ~/img2ui-out
  }
}
```

### Project / Page / State

```ts
type Project = {
  id: string                       // nanoid(8)
  name: string
  description?: string
  tech_stack_hint?: string         // "Next.js + Tailwind + shadcn"
  cdn_provider_id?: string         // 覆盖默认 CDN
  created_at: string
  updated_at: string
}

type Page = {
  id: string                       // nanoid(8)
  project_id: string
  name: string                     // "抽中页"
  route_hint?: string              // "/lottery/result"
  canonical_state_id: string       // 默认状态,跨状态资产以它为基准
  created_at: string
  updated_at: string
}

type StatePipelineStatus =
  | 'idle'
  | 'pass1_running' | 'pass1_done' | 'pass1_failed'
  | 'pass2_running' | 'pass2_done' | 'pass2_failed'
  | 'validating' | 'validated'

type State = {
  id: string                       // nanoid(8)
  page_id: string
  name: string                     // "canonical" / "hover" / "empty"
  original_image_path: string      // data/raw/{state-id}.png
  width: number
  height: number
  pipeline_status: StatePipelineStatus
  pass1_run_id?: string
  pass2_run_id?: string
  created_at: string
}
```

### Element / Asset

```ts
type Element = {
  id: string                       // nanoid(8),跨状态对齐:同 entity 同 id
  page_id: string
  state_ids: string[]              // 出现在哪些 state
  name: string                     // "卡通娃娃"
  type: 'static' | 'code'
  visual_category: VisualCategory  // Pass 1 输出(Phase 8b),5 类 + other 兜底
  bbox: [number, number, number, number]   // canonical 原图归一化坐标 [x,y,w,h] ∈ [0,1]
  z_index: number                  // Pass 1 产出,可手改
  description: string              // for coding agent + Pass 2 prompt 渲染源, ≤ 80 字

  // type=code 才有
  shape_spec?: string              // SVG path / clip-path / 几何描述
  material_spec?: string           // 渐变 / 阴影 / 材质参数

  cross_state_notes?: string       // "loading 状态下此元素颜色变灰"
  pass1_routes_seen?: string[]     // debug:此 element 在哪几路 Pass 1 中被识别(Phase 8b)
  reviewed: boolean                // 用户是否手动 review 过
  created_at: string
  updated_at: string
}

// Phase 8b 新增:5 类视觉分类(正交于 type=static/code)
// 用于 Pass 1 5 路并行调度 + Pass 2 按类分组(Phase 8c)
// 不是「第三类 type」,只是给 Pass 1/2 流程用的元数据
type VisualCategory =
  | 'subject'        // 主体:IP 角色 / 大艺术字标题 / 主商品图
  | 'button'         // 异形 / 复杂材质 / 强活动感按钮
  | 'container'      // 异形展示框 / 票券 / 卡片底图(承载文字内容,响应式)
  | 'background'    // 全页渐变 / 大色块 / 光晕 / 远景纹理
  | 'decoration'   // 星星 / 彩带 / 高光 / 小贴纸徽章 / 固定文案小标签
  | 'other'          // 5 类都套不上的兜底,人工 review 时归类

// 优先级:数字越小越优先(IoU 合并冲突时高优先级胜出)
// subject(1) < button(2) < container(3) < background(4) < decoration(5) < other(6)

type AssetStatus = 'extracted' | 'validated' | 'uploaded' | 'failed'

type Asset = {
  id: string                       // 与 element.id 一致
  element_id: string
  page_id: string
  local_path: string               // data/assets/{asset-id}.png
  cdn_url?: string
  width: number
  height: number
  alpha_quality: number            // 0-1
  validation_notes?: string
  status: AssetStatus
  created_at: string
  updated_at: string
}
```

### PipelineRun

```ts
type PipelinePassKind =
  | 'pass1'                                                              // Phase 8b:多路 Pass 1 的总 run(audit 入口)
  | 'pass1_subject' | 'pass1_button' | 'pass1_container'                 // Phase 8b sub-runs(每路独立 callMllm + sub-run)
  | 'pass1_background' | 'pass1_decoration'
  | 'pass2'                                                              // Phase 8c 之前:单次 image_gen
  | 'pass2_subject' | 'pass2_button' | 'pass2_container'                 // Phase 8c sub-runs(按 visual_category 分组)
  | 'pass2_background' | 'pass2_decoration' | 'pass2_other'
  | 'validate' | 're_extract'

type PipelineRun = {
  id: string                       // nanoid(8)
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
    extra: object                  // 其他参数(temperature, max_tokens 等)
  }
  llm_response: object             // 原始返回值,留底
  parsed_result?: object           // 解析后的结构化结果
  error?: { code: string; message: string; retryable: boolean }
}
```

---

## API 契约

所有路由在 `src/app/api/*/route.ts` 下。Body 与 Response 默认 `application/json`,文件上传用 `multipart/form-data`

### Config

```
GET  /api/config
  → 200 AppConfig (provider.api_key 已遮罩为 sk-***xxxx)

PUT  /api/config
  Body: AppConfig
  → 200 AppConfig
  服务端处理:遮罩字符串视为「未改动」,从磁盘读原值还原

POST /api/config/test
  Body: { provider_id: string }
  → 200 { ok: boolean, message?: string, latency_ms?: number }
  服务端发一次最小请求(mllm: 5-token ping;image_gen: 16x16 单像素生成;
  cdn: HEAD bucket)
```

### Project / Page / State

```
GET    /api/projects                  → 200 Project[]
                                       Project 多带 sample_thumbnail_url?:string
                                       (项目下首个有缩略图 page 的 /api/thumbs/{id};无则缺省)
POST   /api/projects                  Body: Pick<Project, 'name'|'description'|'tech_stack_hint'|'cdn_provider_id'>
                                       → 201 Project
GET    /api/projects/[id]             → 200 Project
PUT    /api/projects/[id]             Body: Partial<Project>  → 200 Project
DELETE /api/projects/[id]             → 204 (级联删除 pages 与底下所有数据)

GET    /api/projects/[id]/pages       → 200 Page[]
                                       Page 多带 thumbnail_url?:string,thumbnail_path 字段被剔除
POST   /api/projects/[id]/pages       Body: { name, route_hint? }  → 201 Page
GET    /api/pages/[id]                → 200 Page
PUT    /api/pages/[id]                Body: Partial<Page>  → 200 Page
DELETE /api/pages/[id]                → 204

POST   /api/pages/[id]/states         Body: multipart
                                        - files: File[]              // PNG 图片
                                        - meta: JSON string {
                                            states: [{ filename, name, is_canonical }]
                                          }
                                       → 201 State[]
                                       服务端在分配 canonical_state_id 后同步生成缩略图
                                       (失败 console.error 不阻断响应)
DELETE /api/states/[id]               → 204

GET    /api/thumbs/[id]               → 200 image/png + Cache-Control: public, max-age=86400
                                       id 必须严格匹配 ^[a-zA-Z0-9_-]{1,32}$,否则 400
                                       data/thumbs/{id}.png 不存在时 404
```

### Pipeline

```
POST  /api/states/[id]/pass1
  Body: { force?: boolean }            // force=true 时即使已完成也重跑
  → 202 { run_id: string }

POST  /api/states/[id]/pass2
  Body: { force?: boolean }
  → 202 { run_id: string }
  前置:state 必须 pass1_done 且所有 element 都 reviewed=true

POST  /api/states/[id]/validate
  → 202 { run_id: string }
  前置:state 必须 pass2_done

GET   /api/pipeline-runs/[id]
  → 200 PipelineRun
  前端可轮询(2s 间隔),completed/failed 时停止
```

### Element / Asset

```
GET   /api/pages/[id]/elements                → 200 Element[]
PUT   /api/pages/[id]/elements                Body: Element[]
                                                (整批替换,原子写)
                                               → 200 Element[]

POST  /api/elements/[id]/re-extract
  Body: {} (空,使用 element 当前 description 重新渲染 prompt)
  → 202 { run_id: string }
  服务端:渲染只含该 element 的 Pass 2 prompt(element_summary 单元素版),
  调一次 image_gen 产出绿幕 layout PNG,chroma key + 切片后替换该 asset,
  并把新 PNG 写到 `data/pass2/{state-id}-element-{id}.png` 留底,更新 Asset

POST  /api/assets/[id]/upload                  → 200 Asset (with cdn_url)
POST  /api/pages/[id]/upload-all-assets
  → 200 { uploaded: number, failed: AssetID[] }
```

### Export

```
POST  /api/pages/[id]/export
  Body: { output_dir?: string, format: 'folder' | 'zip' }
  → 200 (folder) { path: string }
  → 200 (zip)    application/zip stream
```

---

## Provider 调用模式

不同 provider 的接口形态差异由 `api_format` + `is_async` 字段决定。`lib/llm-client.ts` 是 dispatcher,按 kind + api_format 路由到具体实现

### chat completions (kind=mllm)

所有 mllm provider 都走 sync 模式,但 auth header 格式按 `api_format` 区分:

```ts
async function callMllm(provider, opts: {
  messages, max_tokens?, temperature?, response_format?, extra_body?, signal?
}): Promise<{ content: string, usage: object }>
```

| api_format | endpoint | auth header | 备注 |
|---|---|---|---|
| `openai` | POST `${base_url}/chat/completions` | `Authorization: Bearer ${api_key}` | OpenAI 直连 / apimart chat / 大多数 OpenAI 兼容 gateway |
| `anthropic` | POST `${base_url}/messages` | `x-api-key: ${api_key}` + `anthropic-version: 2023-06-01` | Claude API |
| `sankuai` | POST `${base_url}/chat/completions` | `Authorization: ${api_key}`(**无 Bearer 前缀**) | sankuai gateway,gemini 类模型常驻 |

response 在 `choices[0].message.content`(对所有 OpenAI 兼容格式一致)

**`extra_body` 透传**:provider 特有参数(如 gemini 的 thinking config)直接放进 body,call layer 不解释:
```ts
// gemini-3.1-pro-preview via sankuai
extra_body: {
  google: {
    thinking_config: { include_thoughts: false, thinking_budget: 4096 }
  }
}
```

### image generation (kind=image_gen)

#### Sync 模式(api_format='openai',`is_async: false`)

```ts
POST ${base_url}/images/generations  // 或 /images/edits
→ 200 { data: [{ url? | b64_json? }] }  // 直接返回结果
```

适用:OpenAI 直连(用户自带 OpenAI key)

#### Async 模式(api_format='apimart',`is_async: true`)

```ts
// 1. Submit
POST ${base_url}/images/generations
Body: {
  model: "gpt-image-2-official",         // ★ 不是 backup `gpt-image-2`
  prompt: string,
  image_urls?: string[],     // 图生图,base64 with "data:image/png;base64," prefix 或 URL
                             // ★ Phase 8c 起支持多张:[原图, ...crops](Pass 2 多参考图)
                             //    PoC #1 实测 gpt-image-2-official 接受多张时按 crop 复刻不 regenerate
                             //    数组顺序约定:index 0 = 主图(整体语境),1..N = 各 element 的 crop
  size: "1:1" | "9:16" | ...,
  resolution: "1k" | "2k" | "4k",
  quality: "low" | "medium" | "high",    // ★ 必须 "high",否则文字乱码
  n: 1
}
→ 200 { code: 200, data: [{ status: "submitted", task_id: string }] }

// 2. Poll(initial delay 12s,然后每 5s 一次,最多 24 次)
GET ${base_url}/tasks/{task_id}
→ 200 { code: 200, data: {
    status: "pending" | "completed" | "failed",
    result?: { images: [{ url: string[], expires_at: number }] },
    cost: number, actual_time: number
  }}

// 3. Download
GET <result.images[0].url[0]>
Headers: { User-Agent: "Mozilla/5.0 ..." }   // 必须带 UA,默认 curl/python UA 会 403
→ binary PNG
```

call 层封装成 promise(对调用方透明 sync):

```ts
async function callImageGen(provider, opts: {
  prompt: string,
  reference_image_base64?: string,      // 主图 data URL(原图)
  reference_image_base64s?: string[],   // 额外参考图(crop 列表,Phase 8c 多参考图)
                                        // 内部拼成 image_urls = [main, ...refs]
  size?: string,
  resolution?: string,
  quality?: 'low' | 'medium' | 'high',
  n?: number,
  signal?: AbortSignal
}): Promise<{ image: Buffer, cost?: number, latency_ms: number }>
```

### ~~segmenter~~(已删除)

PoC v11 后绿幕 chroma key 已 0 API + 0 抠穿,无需任何外部分割模型 fallback。`kind: 'segmenter'` 从 ProviderKind 中移除。详见 § 抠图 + 切片。

### CDN (kind=cdn)

api_format='s3',用 @aws-sdk/client-s3 客户端。Test Connection 用 HeadBucket

---

变量用 `{{var}}` 占位

### Pass 1: 布局分析

**Phase 8b 后:5 路并行 only-X(non-trivial 改动)**

Pass 1 不再是 1-shot,而是 **5 路并行调用** mllm,每路只识别一类 `visual_category`:

| 路次 | category | sub-run pass kind |
|---|---|---|
| 1 | subject | `pass1_subject` |
| 2 | button | `pass1_button` |
| 3 | container | `pass1_container` |
| 4 | background | `pass1_background` |
| 5 | decoration | `pass1_decoration` |

每路在原 base prompt 前面拼一段 over-include 头部(由 `lib/prompts/render-pass1-route.ts` 在运行时拼接),拼接源:

- `VISUAL_CATEGORY_DEFINITION_EN[category]`(英文严格定义,见 `lib/visual-category.ts`)
- `VISUAL_CATEGORY_EXAMPLES_CN[category]`(中文具体物名锚定,PoC #2 v3 验证可显著提升召回率)
- 「OVER-INCLUDE PHILOSOPHY」措辞(反例:`PoC #2 v2` 用 EXCLUSIVE「DO NOT return others」会让边界 case 普遍丢元素)

下游合并:`mergeRoutes`(IoU > 0.5 视为同一物理元素,优先级 subject < button < container < background < decoration 决定 category 归属);Promise.allSettled 容忍 ≤ 2/5 路失败,< 3 抛 `PASS1_ERROR`。`pass1_routes_seen` 字段记录元素被哪几路命中(debug 用)。

总 run 用 `pass: 'pass1'` 创建作 audit 入口,`llm_response.successful_routes` / `failed_routes` 记录路次结果;sub-runs 用 `pass: 'pass1_${category}'` 单独创建,挂同一 `state_id`,通过查询 state 关联。

---

**System / Developer message(base prompt,5 路共享):**

```
You are a UI design analyzer. Identify EVERY visible visual element in the design mockup. Be EXHAUSTIVE — typical pages have 15-30 elements.

For each element, classify:
- `static`: a self-contained decorative graphic where the visual look IS the content (3D rendered character, illustration, decorative chip/badge/stamp with text-as-graphic, ornamental seal). Static elements will be extracted as transparent PNG assets.
- `code`: structural or interactive elements better implemented in code:
  - OS UI (status bar, system buttons)
  - Containers that hold child elements (异形 frames, cards, sections)
  - Standard text blocks (titles, paragraphs, descriptions, prices) where text is the meaning
  - Standard UI controls (buttons, inputs, list items)
  - Connection lines / 引线 / dividers

Decision heuristic for elements containing text:
- If the text is part of a designed graphic where typography/style/layout matters as much as the content (e.g. calligraphic seal "解签", branded chip "黑糖珍珠" with stylized pink gradient + icon + decorative typography) → `static`
- If the text is plain content text where readability matters more than decorative styling (e.g. product name "奈雪的茶 | 黑糖珍珠水牛乳", price "¥12.88", description "840m · 15分钟") → `code`

Output strict JSON, no markdown, no prose:
{"elements": [{
  "entity_name": string,    // lowercase_underscore, descriptive (not chip_1)
  "type": "static" | "code",
  "type_reasoning": string,
  "bbox": [x, y, w, h],     // **NORMALIZED 0-1**, relative to canonical state
  "z_index": number,
  "description": string,    // for coding agent AND Pass 2 prompt rendering, max 80 chars in Chinese
  "shape_spec": string?,         // ONLY when type=code
  "material_spec": string?,      // ONLY when type=code
  "cross_state_notes": string?,
  "appears_in_states": string[]
}]}

Rules for description (always required):
- Chinese, ≤ 80 chars
- Mention key visual features: shape, dominant colors, text content (literal), distinguishing details
- Same `name`(由 description 提取的中文称呼)在多个元素之间保持一致 — Pass 2 prompt 渲染时按 name 自动数量分组(如 3 张奶茶 chip → 「奶茶 chip 共 3 个」)
- 不要写英文、不要写 JSON、不要写技术术语(SVG/CSS),把它当成给小学生描述这个元素的语言

Rules for shape_spec / material_spec (only when type=code):
- shape_spec: SVG path, CSS clip-path, or geometric description with key params (corner radius, dimensions ratio)
- material_spec: gradient stops, shadow, blur, glass effect, etc.

Cross-state alignment: same physical entity in multiple state screenshots MUST share the same `entity_name`

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
- Product images / thumbnails — static
```

**User message:**

```
Page name: {{page_name}}
Page description (user-provided): {{page_description}}
Tech stack hint: {{tech_stack_hint}}

States ({{state_count}} total, canonical first):
1. canonical: {{canonical_image}}
2. {{state2_name}}: {{state2_image}}
...

Be EXHAUSTIVE. Identify every distinct element separately. Return JSON.
```

**Provider 设置:** `gemini-3.1-pro-preview`(via sankuai gateway,首选)/ `gpt-4o`(via OpenAI 直连或 apimart,备选,CJK 准确度低 30%+)
- `temperature: 1`(PoC v8-v11 实测,gemini 在 temperature=1 下分类粒度 + CJK 准确度都最优)
- `response_format: { type: "json_object" }`,`max_tokens: 12000`
- gemini 加 `extra_body.google.thinking_config.thinking_budget: 4096`

### Pass 2: 资产提取

**Phase 8c 后:按 visual_category 分组并行 + 多参考图**

Pass 2 不再是 1-shot,而是 **按 type=static 元素的 `visual_category` 分组**(subject / button / container / background / decoration / other),每组一路 image-edit 调用,每路传 `[原图, ...crops]` 多参考图。code 元素整体跳过(用户在 Element Review 校对完后,Pass 2 只处理 static)。

| 路次 | category | sub-run pass kind |
|---|---|---|
| 1 | subject | `pass2_subject` |
| 2 | button | `pass2_button` |
| 3 | container | `pass2_container` |
| 4 | background | `pass2_background` |
| 5 | decoration | `pass2_decoration` |
| 6 | other | `pass2_other` |

并发用 `Promise.allSettled`,**部分失败容忍**:单路失败 → 该路所有 elements 的 asset 标 `status='failed'`,其他路正常完成。Pass 2 总 run 仍 `completed`,失败的 element 在 Asset Review 提示用户重抠。

总 run 用 `pass: 'pass2'` 创建作 audit 入口,`llm_response.successful_routes` / `total_routes` 记录路次结果;sub-runs 用 `pass: 'pass2_${category}'` 单独创建。

**Image edit instruction(发给 gpt-image-2-official / image-to-image endpoint,每 category 单独渲染,见 `lib/prompts/render-pass2-route.ts`):**

模板使用会话式自然语言,运行时按当前 page 当前 category 的 elements 渲染。**编号引用规则**:参考图 #1 是原图(整体语境),#2..#N 是 crops(每个 element 一张,顺序与 elements 数组一致)。

```
我们来尝试一下,把这张图({{page_description}})里的{{category_cn}}类元素提取出来,单独放在一张鲜亮的纯绿色 #00FF00 背景画布上,作为后期抠像的绿幕。元素本身不要使用这个绿色。

第 1 张参考图是原图,展示了这些元素在画面里的整体样貌。后面的参考图是从原图取出的每个元素的特写,要画的就是这些:

- 参考图 #2:「{{element_1.name}}」({{element_1.description}})
- 参考图 #3:「{{element_2.name}}」({{element_2.description}})
...

共 {{element_count}} 个元素,记得每个都画到。元素之间留出至少一整个元素宽度的空隙,宁可画布留白多也不要挤在一起。每个元素都要跟参考图里完全一致——保持原图的风格、颜色、文字内容,不要重新设计任何元素。
```

**`reference_images` 数组顺序**(由 `pass2-runner.ts` 拼装):

| 索引 | 内容 | 来源 |
|---|---|---|
| #1 | 原图(整体语境) | `data/raw/{state-id}.png` |
| #2 | 第 1 个 element 的 crop | `cropFromBbox(rawBuf, elements[0].bbox)` |
| #3 | 第 2 个 element 的 crop | `cropFromBbox(rawBuf, elements[1].bbox)` |
| ... | ... | ... |
| #N+1 | 第 N 个 element 的 crop | `cropFromBbox(rawBuf, elements[N-1].bbox)` |

`callImageGen` 接口对应:`reference_image_base64` = 原图 data URL,`reference_image_base64s` = crops 数组,内部拼成 `image_urls = [main, ...crops]` 喂给 apimart。

**Provider 设置:** `gpt-image-2-official` via apimart(首选,**注意不是 backup `gpt-image-2`**)
- `size: "1:1"` 或 `"9:16"`(竖屏)
- `resolution: "1k"`(MVP-α 默认)
- `quality: "high"`(**必须**,否则文字大量乱码,v3-v7 教训)
- async pattern,见 § Provider 调用模式
- 实测单价 ~$0.17/页(1024×1024, quality=high),时延 60-220s

**关键决策**(详见 [CLAUDE.md § 反直觉强约束 § 6](./CLAUDE.md#6-pass-2-用绿幕-00ff00-背景做-chroma-key-参考色严禁-transparent-prompt-也严禁白底-prompt2026-05-13-poc-v11-锁定)):
- ❌ 不要白底:本地抠图会抠穿元素内部白色(chip 白底、娃娃白发等)
- ❌ 不要 transparent prompt:触发模型 regenerate,漏画 + 字形漂
- ✅ 用 `#00FF00` 绿幕:0 抠穿 + 0 API 抠图 + 文字保真
- ✅ Phase 8c 起:多参考图 `[原图, ...crops]` 让 bbox 编辑生效(用户拖框 → crop 改 → 模型按新 crop 复刻,不 regenerate)

**Prompt 措辞硬约束**(违反必复发 v2 失败):
- ❌ 不写 "TRUST SOURCE NOT DESCRIPTION" / "pixel-faithfully" / "MUST" 等激进措辞
- ❌ 不在 prompt 里塞 entity_name / bbox / JSON / 字段名
- ✅ 用会话式自然中文,「记得」「保持」「不要重新设计」这种温和措辞
- ✅ 用编号引用 crop:「参考图 #2 是 X」(不是 entity_name,降低模型出现 schema-aware 的可能)

**切片合并约束:** 每路独立做 chroma key + slice + 写 asset,**只在该路 elements 范围内匹配**(`limit = min(elements.length, slices.length)`)。模型多画的切片直接丢弃,模型漏画的元素该路无对应 asset(用户在 Asset Review 看到空 → 触发 re_extract)。**不跨 category 串切片。**

**输出尺寸:** 由模型决定(1024×1024 默认),前端按实际尺寸读取。元素位置坐标用 Pass 1 bbox 不依赖 Pass 2 输出位置(见 [CLAUDE.md § 反直觉强约束 § 2](./CLAUDE.md))

### Pass 2 反向校验

**System / Developer message:**

```
You are a quality validator. Given an extracted transparent PNG and the
expected element list, evaluate each element's extraction quality.

Output strict JSON:

{
  "elements": [{
    "entity_name": string,
    "complete": boolean,           // is the element fully present
    "alpha_quality": number,       // 0-1, edge cleanliness
    "style_match": number,         // 0-1, vs source image
    "contamination": boolean,      // contains pixels from other elements
    "notes": string
  }]
}
```

**User message:**

```
Source image: {{canonical_image}}
Keyed PNG: {{keyed_png}}
Expected elements: {{elements_json}}

Validate each element.
```

---

## 抠图 + 切片(Pass 2 后)

Pass 2 输出绿幕 #00FF00 背景 PNG(高保真)→ 本地 chroma green key → 透明 PNG → 切片成单 asset

### 抠图算法(`lib/alpha-key.ts`)

```ts
function chromaGreenKey(greenScreenPng: Buffer, opts?: {
  full_alpha_threshold?: number,    // 默认 60,g_excess > 此值视为完全绿(α=0)
  full_opaque_threshold?: number,   // 默认 25,g_excess < 此值视为完全不透明(α=255)
  spill_suppression?: boolean       // 默认 true,在保留像素上压抑绿溢色
}): Buffer {
  // 1. 转 RGB,逐像素算 g_excess = G - max(R, B)
  // 2. g_excess > full_alpha_threshold (60) → α=0
  //    g_excess < full_opaque_threshold (25) → α=255
  //    中间 → 线性插值
  // 3. spill suppression:对 α>0 的像素,把超出 max(R,B) 的绿色部分压回去
  //    G_new = G - max(0, g_excess)
  //    防止元素边缘有「淡绿描边」
  // 4. 合成 RGBA,返回 PNG buffer
}
```

实测在 PoC v11 上:76.7% 透明 + 23.2% 不透明 + 0.2% 半透。**0 API 调用**,**~1s 处理**。元素内部白色 / 浅色 / 半透 / 玻璃质感全部保留(chroma key 判别色是 #00FF00,与 UI 元素色域几乎无重叠)。

**已知边界 case**:
- 元素内部恰好出现 #00FF00 纯绿(UI 设计稿罕见,prompt 已显式排除)→ 该像素被误抠透明 → Asset Review 单元素重抠 + 手动覆盖
- 元素带半透明阴影邻接绿幕 → 边缘有微弱绿溢 → spill suppression 已处理大部分;Asset Review 提供 slider 调阈值 + 「edge clean」局部清理按钮

**v10 之前预留的 white-threshold 已删除**(否决理由:抠穿元素内部白色,结构性死路)。**`kind: 'segmenter'` provider 也已删除**——绿幕 chroma key 已无需任何外部分割模型 fallback

### 切片算法(`lib/slicer.ts`,基于 `ref/split_elements.py` 的 scipy 实现移植)

```ts
function sliceAssets(transparentPng: Buffer, elements: Element[], opts?: {
  gap?: number,           // binary_dilation 迭代次数,默认 15(桥接同元素内部小断裂)
  padding?: number,       // 每个连通块 bbox 加的 padding,默认 5
  min_size?: number,      // bbox 任一边 < 此值的连通块过滤(噪点),默认 30
  min_opaque_pct?: number // 二级过滤:bbox 内 opaque 像素 % < 此值的连通块过滤,默认 1.0
}): Asset[] {
  // 1. 读 alpha 通道,mask = alpha > 10
  // 2. scipy.ndimage.binary_dilation(mask, iterations=gap) 桥接断裂
  // 3. scipy.ndimage.label(dilated) connected component
  // 4. 每个 component 的 bbox 加 padding,min_size 过滤
  // 5. 二级过滤:opaque (α>200) 像素占 bbox 面积 < min_opaque_pct(1%) → 视为噪点剔除
  //    (防止抠图后只有微弱半透残留的「假元素」)
  // 6. extract 后保存为透明 PNG
  // 7. 元素到切片的映射:MVP 用「按 (y, x) 排序对应 elements 数组顺序」
  //    + 用户在 Asset Review 可手动调整。v1 优化用 vision LLM 二次确认对应关系
}
```

参考实现见 `ref/split_elements.py`(直接移植,不要重写)。

**已知边界 case**:
- 异形 frame 内部白色镂空 → Pass 1 已判定 frame 为 `type=code`,**不**进 Pass 2 → 不切片,无影响
- 两元素物理紧贴 → 连通块合并 → Asset Review 提供「拆分」工具 / 用户重跑 Pass 2(模型每次布局不同)
- 同元素被切碎(chip 描边和文字之间断裂超过 gap=15)→ 加大 `gap` 参数(UI slider 提供 5/10/15/20)
- 切片粒度问题不阻断 pipeline,降级到 Asset Review 手动处理

---

## Export 文件结构

```
{output_dir}/{project-name}/
├── config.json                     # project meta + asset CDN base URL
├── pages/
│   └── {page-name}/
│       ├── meta.json               # page meta + states list
│       ├── states/
│       │   ├── canonical.json      # layout: 元素 + 引用 asset_id
│       │   ├── hover.json
│       │   └── empty.json
│       ├── assets/
│       │   ├── {asset-id}.png      # 本地副本
│       │   └── manifest.json       # asset_id → cdn_url 映射
│       ├── spec.md                 # for coding agent,主入口
│       └── raw/
│           ├── original-canonical.png
│           ├── original-hover.png
│           └── extracted.png       # Pass 2 留底
```

### `config.json`(项目级)

```ts
{
  "project": { ...Project },
  "asset_cdn_base": string,        // e.g. https://cdn.foo.com/img2ui/proj-xxx/
  "img2ui_version": string,
  "exported_at": string
}
```

### `pages/{page}/meta.json`

```ts
{
  "page": { ...Page },
  "states": [{ id, name, is_canonical, original_image_filename }]
}
```

### `pages/{page}/states/{state}.json`

```ts
{
  "state_id": string,
  "state_name": string,
  "image_size": [width, height],
  "elements": [{
    "id": string,
    "type": "static" | "code",
    "name": string,
    "bbox": [number, number, number, number],
    "bbox_pixels": [number, number, number, number],  // 反归一化
    "z_index": number,
    "description": string,
    "asset_id"?: string,             // type=static 时存在
    "shape_spec"?: string,
    "material_spec"?: string,
    "cross_state_notes"?: string
  }]
}
```

### `pages/{page}/assets/manifest.json`

```ts
{
  "{asset-id}": {
    "filename": string,             // {asset-id}.png
    "cdn_url": string | null,       // null 表示未上传 CDN,coding agent 用本地
    "width": number,
    "height": number,
    "element_id": string
  }
}
```

### `pages/{page}/spec.md`

```markdown
# {Page Name}

## 项目信息
- 项目: {project name}
- 路由: {route_hint}
- 技术栈: {tech_stack_hint}
- 状态: canonical / hover / empty

## 整体描述
{Pass 1 时让多模态 LLM 写的页面整体语义描述}

## 状态: canonical
### 元素列表
| id | type | name | description | asset / spec |
|---|---|---|---|---|
| ... | static | 卡通娃娃 | 蓬松云朵头发的小娃娃,蓝色羽绒服 | ↗ assets/cute_doll.png |
| ... | code | 粉色异形容器 | 圆角矩形,顶部 notch,渐变粉色 | shape: `M0,40 ...` |

### 布局描述
{由元素 bbox + z_index + 描述合成的人话布局}

## 状态: hover
{相对 canonical 的 diff,只列出变化的元素}

## Coding agent 指令
{config.prompts.coding_agent_intro 内容}
- 优先使用项目现有组件库({tech_stack_hint})
- 异形容器用 SVG path 或 CSS clip-path 实现
- 静态资产引用 CDN URL(见 manifest.json),不要本地化
- 多状态用 React state 切换,共享同一组件
```

---

## 文件系统布局(`data/`)

```
data/
├── config.json                    # AppConfig
├── projects/
│   └── {project-id}.json          # Project
├── pages/
│   └── {page-id}.json             # Page
├── states/
│   └── {state-id}.json            # State
├── elements/
│   └── {page-id}.json             # 整页 Element[](原子写整批替换)
├── assets/
│   └── {asset-id}.json            # Asset metadata
├── pipelines/
│   └── {run-id}.json              # PipelineRun
├── raw/
│   └── {state-id}.png             # 用户上传的原图
├── thumbs/
│   └── {page-id}.png              # 列表卡片缩略图(canonical state 256px,Phase 8e)
├── pass2/
│   └── {state-id}.png             # Pass 2 输出的绿幕 #00FF00 背景 PNG(留底,debug 用)
├── keyed/
│   └── {state-id}.png             # chroma key 后的透明 PNG(切片输入)
└── assets-bin/
    └── {asset-id}.png             # 切片后的单 asset PNG
```

### 原子写

所有 JSON 写都走 `lib/fs-utils.ts` 的 `writeAtomic(path, content)`:
```
1. write to {path}.tmp.{nanoid(8)}
2. fsync
3. rename to {path}
```

PNG 写直接 `fs.promises.writeFile`(图片大,原子写收益小)

### 并发锁

同一 `state_id` 的 Pass 1 / Pass 2 / re-extract 不允许同时跑,用 `lib/run-lock.ts` 维护一个内存 Map(因为单进程 Next.js,内存锁够用)。冲突时返回 `409 Conflict`

---

## 缩略图生成(Phase 8e)

项目列表 / 页面列表卡片需要缩略图,便于「看图找页」。

### 触发时机

- canonical state 上传时(POST /api/pages/[id]/states 中,只在 page 当前 `canonical_state_id` 为空 + 用户标了 `is_canonical` 时同步触发一次)
- `lib/pages.ts` 暴露 `maybeGenerateThumbnailForPage(pageId)`,任一前置条件缺失(page 不存在 / 无 canonical / canonical PNG 不在盘上)静默返 null

### 生成

`lib/thumbnails.ts.generateThumbnail(pageId, srcBuffer)`:
- sharp `resize({ width: 256, height: 256, fit: 'inside', withoutEnlargement: true })`
- `png({ quality: 85, compressionLevel: 9 })`
- 输出 `data/thumbs/{pageId}.png`,典型 < 50KB

### 已有 page 无缩略图

**不做 lazy-generate**:列表 API GET /api/projects 与 /api/projects/[id]/pages 不会在请求时为缺失缩略图的 page 现场生成。原因:
1. 列表 API 必须毫秒级响应,不能等 sharp 处理 N 张原图
2. 上线前已存在的 page,用户重新上传一次 canonical state 即可触发(MVP 不做单独「重新生成缩略图」按钮)

无 thumbnail_path 的 page 在前端走 `<img onError>` fallback 到 lucide icon(`<Folder/>` 项目卡 / `<FileText/>` 页面卡)。

### 安全

GET /api/thumbs/[id] 严格校验 id 字符集 `^[a-zA-Z0-9_-]{1,32}$`(nanoid 字符集 + `page_` 前缀长度上限),非法返 400。Response 加 `Cache-Control: public, max-age=86400`,缩略图变更频率低(只在重新指派 canonical state 时变),24 小时缓存合理。

---

## 错误与重试

### LLM 调用层

`lib/llm-client.ts` 提供:
- 3 次 retry(exponential backoff: 1s / 4s / 9s),只在 `retryable: true` 错误码上重试
- 120s 超时
- 区分:
  - `retryable: true` → 网络错误、5xx、429 rate limit
  - `retryable: false` → 4xx 客户端错(API key 失效、参数错)、模型 refuse

### Pipeline 层

- Pass 1 失败:写 PipelineRun.error,前端展示「重试 Pass 1」按钮(同一 prompt 重发)
- Pass 2 失败:同上
- 反向校验失败:不阻断,Asset 全部标记为 `extracted`(未校验状态)
- 单元素重抠失败:不影响其他 asset,只该 asset 标 `failed`,前端可手动覆盖上传

### CDN 上传

- 单文件失败:可重试,不影响其他文件
- 全部失败:Pipeline 阻断在 CDN 上传步骤,前端可重试或跳过(跳过则 manifest.json 中 cdn_url=null,coding agent fallback 用本地路径)

---

## 数据依赖总表

### 离线生产(写到 `data/`)

| 数据 | 来源 | 触发 | 用于 |
|---|---|---|---|
| `data/raw/{state-id}.png` | 用户上传 | POST /states | Pass 1 / Pass 2 输入,Export raw/ 留底 |
| Pass 1 PipelineRun + Element[] | MLLM API | POST /pass1 | Element 列表 / cross-state 对齐 |
| `data/pass2/{state-id}.png` | ImageGen API | POST /pass2 | 绿幕 #00FF00 layout PNG,留底 + 抠图输入 |
| `data/keyed/{state-id}.png` | 本地 chroma green key | Pass 2 后 | 切片输入(透明 PNG) |
| Asset[] + `data/assets-bin/*.png` | scipy 切片 | chroma key 后 | 单 asset 文件 |
| 反向校验 PipelineRun | MLLM API | POST /validate | Asset 状态判定 |
| Asset.cdn_url | CDN API | POST /upload | manifest.json 中的引用 |

### 在线消费(coding agent 读 Export 文件夹时)

| 文件 | 内容 | 空值语义 |
|---|---|---|
| `spec.md` | 整体描述 + 元素表 + 布局 + agent 指令 | 永远存在 |
| `states/{state}.json` | 该状态的 layout 数据 | 永远存在 |
| `assets/{id}.png` | 本地素材副本 | type=static 才有 |
| `assets/manifest.json` | asset_id → cdn_url 映射 | cdn_url 为 null 时 fallback 本地路径 |
| `raw/original-{state}.png` | 原始设计稿 | 永远存在,可视觉参考 |
| `raw/extracted.png` | chroma key 后透明 PNG(Pass 2 留底) | 永远存在,debug 用 |

---

## 版本与兼容

- `AppConfig.version` / `Project.img2ui_version` 字段标记数据格式版本
- 启动时检测,如 schema 变更,跑 `lib/migrations/{from}-{to}.ts` 中的迁移函数
- 迁移失败:阻断启动,提示用户备份 `data/` 后手动处理(MVP 不做自动回滚)

---

## Provider 默认 seed(首启动写入 `data/config.json`)

`src/lib/seeds/default-providers.ts` 提供两组开箱即用的 provider 模板,首启动时写入 `AppConfig.providers`(用户需自行填 api_key 后才能用):

```ts
// MVP-α 默认推荐(基于 PoC v11 锁定)
{
  id: "sankuai-mllm",
  kind: "mllm",
  name: "sankuai Gemini 3.1 Pro (default)",
  api_format: "sankuai",       // 注意:auth header 不带 Bearer 前缀
  base_url: "https://aigc.sankuai.com/v1/openai/native",
  api_key: "",                 // 用户自填
  model: "gemini-3.1-pro-preview",
  default_temperature: 0,
  default_max_tokens: 12000,
  vision_capable: true,
  // sankuai/gemini 特有:thinking_budget(放在 extra_body)
  // call layer 处理时按 api_format='sankuai' 自动加 thinking config
  active: true
},
{
  id: "apimart-imagegen",
  kind: "image_gen",
  name: "apimart gpt-image-2-official (default)",
  api_format: "apimart",
  base_url: "https://api.apimart.ai/v1",
  api_key: "",                 // 用户自填
  model: "gpt-image-2-official",   // 注意:不是 backup `gpt-image-2`,backup 通道字形漂移
  endpoint_kind: "image_generation",
  is_async: true,
  poll_interval_seconds: 5,
  poll_initial_delay_seconds: 12,
  poll_max_attempts: 60,
  default_quality: "high",     // 必须 high,否则文字乱码
  active: true
}

// 备选:OpenAI 直连(用户可在 UI 切换)
{
  id: "openai-mllm",
  kind: "mllm",
  name: "OpenAI GPT-4o (备选,CJK 准确度低)",
  api_format: "openai",
  base_url: "https://api.openai.com/v1",
  model: "gpt-4o",
  vision_capable: true,
  active: false
},
{
  id: "openai-imagegen",
  kind: "image_gen",
  name: "OpenAI gpt-image-1 (备选,直连)",
  api_format: "openai",
  base_url: "https://api.openai.com/v1",
  model: "gpt-image-1",
  endpoint_kind: "image_edit",
  is_async: false,
  default_quality: "high",
  active: false
}
```

**注意**:
- sankuai gateway 的 auth header 用 raw token 不带 `Bearer` 前缀(curl `Authorization: 1983...`)。`api_format='sankuai'` 在 call layer 触发对应处理
- apimart 用标准 `Authorization: Bearer sk-...`,但 image gen 走 task polling,所以 `api_format='apimart'`
- chat completions 在 sankuai 与 apimart 都是 OpenAI 兼容(`POST /chat/completions`),body 接受 `extra_body` 透传 provider 特有参数(如 thinking config)

---

**SPEC 版本**: v0.2 (2026-05-13)
**对应 PRD**: PRD.md v0.2
**架构里程碑**: PoC v11 锁定(绿幕 chroma key + scipy split_elements)
