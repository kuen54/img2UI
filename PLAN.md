# img2UI v2 — 实施计划

> 配套阅读:`/Users/lijiakun/Documents/img2UI-archive/HANDOFF.md`(下文简称 HANDOFF)。本 plan 不复述 HANDOFF,只列**决策点**、**每 phase 的可执行动作**、**与 HANDOFF 的偏离**。
>
> 目的:在 `/Users/lijiakun/Documents/img2UI/` 从 0 重建一个 img2UI,后端按 HANDOFF 重写,UI 用 Material Design,丢弃所有老 UI。

---

## 0. 范围与边界

### 0.1 不复用老代码,但 spec 化产物**逐字照抄**

明确边界(避免再问):

| 来源 | 处理方式 |
|---|---|
| `archive/src/lib/*` | **不 copy、不 import、不参考结构**——按 HANDOFF spec 自己重写 |
| `archive/src/app/*`(老 UI) | **完全丢弃**,UI 从 0 用 MUI 重做 |
| HANDOFF §5.3.1 base prompt(英文) | **逐字照抄**到 `seeds/default-prompts.ts` 的 `DEFAULT_PASS1_LAYOUT` |
| HANDOFF §5.3.2 over-include 头部模板 | **逐字照抄**到 `prompts/render-pass1-route.ts` |
| HANDOFF §6.3.1 全量 Pass 2 中文模板 | **逐字照抄**到 `prompts/render-pass2-route.ts` |
| HANDOFF §6.3.2 re_extract 单元素模板 | **逐字照抄**到 `seeds/default-prompts.ts` 的 `DEFAULT_PASS2_EXTRACT` |
| HANDOFF §6.4 反向校验 prompt | **逐字照抄**到 `seeds/default-prompts.ts` 的 `DEFAULT_PASS2_VALIDATE` |
| HANDOFF §10.6 / §12.1 `coding_agent_intro` | **逐字照抄** |
| HANDOFF 附录 A 视觉分类 EN/CN 定义 | **逐字照抄**到 `lib/visual-category.ts` |
| `archive/ref/split_elements.py`(89 行) | **算法对照移植到 TS**(HANDOFF §9.1 明确"不要重新设计") |
| `archive/ref/generate_images_apimart.py` | 仅作 apimart task polling 协议 fallback 参考(HANDOFF §7.2 已写清楚,默认无需读) |

### 0.2 实测收敛、不许动的参数

`seeds/default-providers.ts` 里这些都是 PoC v1-v12 调出来的,直接照搬:

- mllm: `model='gemini-3.1-pro-preview'`、`temperature=1`、`max_tokens=32000`、`thinking_budget=4096`、`api_format='sankuai'`(无 Bearer 前缀)
- image_gen: `model='gpt-image-2-official'`(**不**是 `gpt-image-2`)、`quality='high'`、`poll_max_attempts=60`、`poll_initial_delay=12s`、`poll_interval=5s`
- chroma key: `full_alpha_threshold=60`、`full_opaque_threshold=25`、spill suppression on
- slicer: `gap=15`、`padding=5`、`min_size=30`、`min_opaque_pct=1.0`
- Pass 1 路次合并: `IoU > 0.5`、优先级 `subject < button < container < background < decoration < other`、`≥3/5` 路成功才算 `pass1_done`

### 0.3 §13 反直觉硬约束 — 全条照守

实施前先读 HANDOFF §13。最容易踩的两条:

- **§13.7**:pipeline 不要自动 fallback koukoutu;只有 `re-key-via-api` 路由才 import matting client
- **§13.8**:Pass 1 prompt 严禁 EXCLUSIVE 措辞(`Return ONLY {category}` / `Do NOT return others`);over-include + IoU 合并是正解

### 0.4 ★ MVP 简化决策(对 HANDOFF 的三处偏离)

经讨论敲定的 3 条 MVP 简化,跟 HANDOFF spec 不一致,以本节为准:

| # | 简化项 | HANDOFF 原方案 | MVP 实际方案 | 影响章节 |
|---|---|---|---|---|
| S1 | **每 page 只支持 1 张图** | Page 下可有多 state(canonical / hover / empty)+ 跨 state 合并 | UI 限制每 page 只能 1 个 state(自动 canonical),数据模型 State 保留不动以备后续扩展 | §4 Phase 2 / §6 Phase 4 |
| S2 | **过滤 mllm 幻觉小元素** | 无显式过滤(HANDOFF §5.4 只列 strip fence + normalizeBboxes) | Pass 1 后处理加 `filterTinyElements`:相对面积 `bbox.w * bbox.h < 0.001` 的丢弃,被过滤 element 写到 PipelineRun.parsed_result 留底,不进 Element[] | §5 Phase 3 |
| S3 | **切片库去自动指派,全手动** | Pass 2 完成默认 (y, x) 指派 + SliceManifest 独立文件 + 「换切图」改派 | Pass 2 不创建 Asset,切片落 `data/slices/{state}-{cat}/{idx}.png`;Asset Review 左切片 grid + 右 element 列表,用户手动拖拽指派;指派关系存在 Asset 自身(`asset.slice_source = {state, cat, idx}`),无独立 manifest | §9 Phase 7 / §14.2 |

**S1 删掉的逻辑**:
- HANDOFF §5.5 跨 state 合并(单 state 不需要)
- Pass 1 prompt 输出的 `appears_in_states` 字段渲染、`cross_state_notes` 持久化
- Element Review UI 多 state 切换、Export `spec.md` 状态 diff 段
- 文件路径仍带 `{state-id}`(后端不动),Element 的 `state_ids` 始终 = `[唯一 state.id]`

**S2 默认值**:相对面积 `< 0.001`(1024² 上约 32×32 px)。Element Review 加折叠"已过滤的 N 个小元素",用户能展开恢复(罕见 case 防误删)。

**S3 收益**:消除"默认指派带来的隐藏错误";Pass 2 完成后切片 grid 一眼能看出"哪一路 chroma 出问题"(模型多画 / 漏画 / 切碎都直接展示)。代价是 30 元素页用户要手动指派 30 次,但跟 Element Review 的 30 次同量级,可接受。

---

## 1. 与 HANDOFF 的偏离点(等你 review 拍板)

### 1.1 ★ UI 技术栈:MUI v6 + Material Design 3 + Figma 蓝主色(已敲定)

HANDOFF §2 推荐 shadcn v4 + Tailwind v4。改为 MUI v6,保留 Material Design 3 视觉语言(大圆角 / ripple / elevation / 系统化 token),**主色用 Figma 蓝替换 MD3 baseline 紫**,其他 MD3 token 保留。

**确定方案**:Next.js 15 + React 19 + TS strict + **MUI v6 + Emotion** + sonner(toast)+ Tailwind 不引 + base-ui 不引(MUI 内置 dialog/popover)。

**关于"MUI 默认主题丑"的应对**:MUI v6 视觉跟 v4/v5 时代的"老 MD2 感"已经差很多——v6 默认更贴 MD3。但默认 baseline purple 配色和 default Roboto 排版在 C 端工具感重,要靠 theme 调到位:

- **主色**:`palette.primary.main = '#0d99ff'`(Figma 蓝),让 MUI 自动派生 light / dark / contrastText
- **typography**:仍 Roboto + 中文 fallback(`PingFang SC`, `Microsoft YaHei`),但行高 / 字号节奏用 MD3 type scale
- **shape**:`borderRadius: 16`(MD3 大圆角,Card 用)+ `Button` / `Chip` / `TextField` 局部 `shape: 12`(MD3 中圆角)
- **elevation**:用 MD3 elevation tokens(`elevation 0/1/3/6`)代替 MUI 默认的 `0..24` 渐变
- **保留**:ripple、`Fade/Grow/Collapse` 默认动效、MD3 ripple 容器(`<ButtonBase>`)
- **不做**:不引 framer-motion / 不做深色模式(MVP)

实际生成 MD3 完整 palette 用 [Material Theme Builder](https://material-foundation.github.io/material-theme-builder/) 喂 `#0d99ff` 即可,把生成的 12 色 tokens 塞进 `src/theme/index.ts`。

**Figma 风格的吸收**(超出 MD3 spec 的部分,可选):
- 项目 / 页面列表 Card 的 hover 用 `elevation 1 → 3`(MD3)+ `transform: translateY(-2px)`(Figma 风微动效)
- Pipeline 状态指示用细条 chip 而不是粗框(Figma 工具栏感觉)
- spacing 偏紧凑(8 / 16 / 24 三档,不上 32+),不像 MD3 默认的 ` 24 起跳`

### 1.2 后端不需要"额外的代码质量重构"

HANDOFF spec 已经够细了,按它写出来的代码结构上不会有质量问题。守:

- TS strict、`fs/promises`、`writeAtomic`(20 行)、内存 lock(单进程 Next.js 够用)
- 每个 lib 文件单一职责,跟 HANDOFF 附录 B 文件清单一一对应
- **不引入额外抽象层**(无 DI / repository / event bus);Route Handler 直接调 lib 函数

### 1.3 Phase 顺序按 HANDOFF §14 不改

10 个 phase 已经被实测验证过依赖关系合理(Phase 5 单 category 通链路 → Phase 6 才加并发,踩坑成本低)。**不合并、不跳过、不重排**。

---

## 2. 仓库初始结构

```
img2UI/
├── PLAN.md                         ← 本文件
├── CLAUDE.md                       ← Phase 1 创建,见 §13
├── package.json
├── tsconfig.json                   ← strict: true
├── next.config.ts
├── eslint.config.mjs
├── data/                           ← gitignore;首启动自动创建
│   └── (HANDOFF §11 完整布局)
├── src/
│   ├── app/
│   │   ├── api/                    ← Phase 1-10 逐步加路由
│   │   ├── layout.tsx              ← MUI ThemeProvider + AppRouterCacheProvider
│   │   ├── page.tsx                ← 项目列表(Phase 2 起)
│   │   ├── projects/[id]/page.tsx
│   │   ├── projects/[id]/pages/[pageId]/page.tsx
│   │   ├── projects/[id]/pages/[pageId]/states/[stateId]/element-review/page.tsx
│   │   ├── projects/[id]/pages/[pageId]/states/[stateId]/asset-review/page.tsx
│   │   ├── settings/providers/page.tsx
│   │   └── settings/prompts/page.tsx
│   ├── lib/                        ← HANDOFF §附录 B 文件清单一一对应
│   ├── theme/index.ts              ← MUI MD3 主题 token
│   ├── components/                 ← UI 组件,见 §14
│   └── middleware.ts               ← CSRF gate
└── public/
```

---

## 3. Phase 1 — 骨架 + Provider 配置

> **退出准则**:Test Connection 对 sankuai mllm + apimart image_gen + S3 cdn 都能 200。

### 动作

1. `pnpm create next-app` Next.js 15 + App Router + TS strict + ESLint(skip Tailwind)
2. 装依赖:
   ```
   @mui/material @emotion/react @emotion/styled
   @mui/material-nextjs/v15-appRouter   # SSR cache
   @mui/icons-material
   sonner
   sharp
   nanoid
   @aws-sdk/client-s3
   ```
3. `src/lib/types.ts`(HANDOFF §3 全部类型,逐字)、`fs-utils.ts`(`writeAtomic`)、`run-lock.ts`(内存 Map)、`id.ts`(`nanoid` 包装)、`mask.ts`(maskKey + unmaskApiKeys)、`config.ts`(AppConfig 读写)
4. `src/lib/llm-client.ts`:
   - `callMllm` 三种 `api_format` 分发(openai / anthropic / sankuai),Bearer / x-api-key / raw token
   - `callImageGen` 同步(openai)+ 异步(apimart)两条路径,异步含 12s initial delay + 5s interval + 60 max attempts + UA header
   - 3 次 exp backoff(1s/4s/9s),只在 5xx/429 上重试
5. `src/lib/seeds/default-providers.ts`(HANDOFF §12 5 个 provider seed 逐字)+ `default-prompts.ts`(4 份 prompt 逐字)
6. `src/lib/visual-category.ts`(枚举 + DEFINITION_EN + EXAMPLES_CN + PRIORITY,HANDOFF 附录 A 逐字)
7. `src/middleware.ts` CSRF gate(`Sec-Fetch-Site === 'same-origin'` 才放行 `/api/*`)
8. `src/app/api/config/route.ts`(GET / PUT)+ `src/app/api/config/test/route.ts`(POST):mllm 5-token ping / image_gen 单像素生成 / cdn HeadBucket
9. UI:`/settings/providers`(MUI Card 列每个 provider,可改 base_url / api_key / model;有 Test Connection 按钮)— **首个 UI,作为 MUI 风格的奠基**
10. 启动时检测 `data/config.json` 不存在 → 写入 default seed

### 关键陷阱

- `api_format='sankuai'` auth header **不带** `Bearer` 前缀(HANDOFF §7.1)
- `unmaskApiKeys` 必须在 PUT handler 里跑(HANDOFF §7.5)。漏掉会把 key 变成字符串 `sk-***xxxx`,不可逆

---

## 4. Phase 2 — Project / Page / State CRUD + 上传

> **退出准则**:能新建项目→新建页面→上传 1 张设计稿→列表 / 详情看到缩略图;删项目级联删干净。

### 动作

1. `src/lib/projects.ts` / `pages.ts` / `states.ts` / `pipelines.ts`:文件读写 + 校验
2. `src/lib/thumbnails.ts`:`sharp(buf).resize(256, 256, { fit: 'cover' }).png()` 落盘 `data/thumbs/{id}.png`
3. API:HANDOFF §4.2 全部端点。**新增约束**:`POST /api/pages/[id]/states` 检查该 page 已有 state 时返回 409(MVP S1)
4. `/api/thumbs/[id]` route:严格 ID 正则 `^[a-zA-Z0-9_-]{1,32}$`,Cache-Control: max-age=86400
5. UI:
   - `/`(项目列表):MUI Grid + Card,缩略图 / 项目名 / 创建时间 / FAB 新建
   - `/projects/[id]`:页面列表(同上)+ FAB 新建页面
   - `/projects/[id]/pages/[pageId]`:**单图上传区**(原生 input + drag,multipart,只接受 1 张 PNG);上传后立即创建 state 并设为该 page 的 `canonical_state_id`;state 已存在时上传按钮变"重新上传"(替换)

### 关键陷阱

- 缩略图生成失败不阻断 state 创建(`console.error` 即可,HANDOFF §4.2)
- `state.pipeline_status` 创建时 `'idle'`(HANDOFF §3.2 状态机)
- MVP S1:多 state 接口保留(后端不动),仅 UI 层把"新增第 2 个 state"按钮藏掉

---

## 5. Phase 3 — Pass 1 单路调用(打通 mllm 链路)

> **退出准则**:上传一张设计稿,触发 pass1,**5-15 个** subject 元素的 bbox + description 落盘到 `data/elements/{page-id}.json`;失败时 PipelineRun 留底完整。

### 动作

1. `src/lib/pass1-runner.ts`:**只跑 1 路**(`category='subject'`),走通 prompt 渲染 → callMllm → 解析 JSON → 写 Element[]
2. `src/lib/prompts/render-pass1-route.ts`:模板拼接(over-include 头部 + base prompt),HANDOFF §5.3.2 逐字
3. 解析后处理流水线(顺序固定):
   - `stripMarkdownJsonFence`:剥 ` ```json ... ``` ` fence(HANDOFF §5.4)
   - `normalizeBboxes`:任一分量 > 1.5 视为像素坐标,按 state.{w,h} 归一化(HANDOFF §5.4)
   - `clampBbox01`:保 `x+w ≤ 1` / `y+h ≤ 1`
   - **`filterTinyElements`**(MVP S2):`bbox.w * bbox.h < 0.001` 的元素丢弃。被过滤的 element 完整保留到 `PipelineRun.parsed_result.filtered_tiny[]`,**不**进 `data/elements/{page-id}.json`
4. `src/lib/elements.ts`:整文件原子覆写
5. `src/lib/pipelines.ts`:PipelineRun 持久化,`llm_request` / `llm_response` 完整留底
6. API:`POST /api/states/[id]/pass1` + `GET /api/pipeline-runs/[id]`(2s 轮询)
7. UI:state 详情页加"运行 Pass 1"按钮 + 状态指示(idle / pass1_running / pass1_done)+ PipelineRun 进度展示

### 关键陷阱

- gemini 偶尔包 ` ```json ... ``` ` fence,务必 strip
- `max_tokens: 32000`,**不**是 12000(HANDOFF §5.4 实测教训)
- `extra_body.google.thinking_config` 透传到 body,call layer 不解释

---

## 6. Phase 4 — Pass 1 5 路并行 + 合并

> **退出准则**:同一张设计稿,5 路并行后 Element 总数 > Phase 3 单路;肉眼无重复(IoU 合并生效)。故意把 sankuai key 改坏 1 路 → 其他 4 路成功,pass1 仍 done。

### 动作

1. `pass1-runner.ts` 改造为 `Promise.allSettled` 5 路 sub-runs(subject / button / container / background / decoration);每路独立 PipelineRun(`pass: 'pass1_${category}'`),总 audit run `pass: 'pass1'` 记 `successful_routes` / `failed_routes`
2. `src/lib/bbox-iou.ts`(HANDOFF §5.2 公式逐字)
3. `src/lib/pass1-route-merger.ts`:两两 IoU > 0.5 → 同一物理元素;冲突按优先级取胜出 category;`element.pass1_routes_seen[]` 累计 debug
4. **跨 state 合并跳过**(MVP S1:单 state per page,无需对齐)。HANDOFF §5.5 这块代码不写
5. `< 3/5` 路成功 → 整个 pass1 status='failed' 抛 PASS1_ERROR
6. Element Review UI 加折叠区"已过滤的小元素 (N)",展开后用户可单点"恢复"把某个被 filterTinyElements 丢的 element 加回 Element[]

### 关键陷阱

- **OVER-INCLUDE 措辞硬约束**(HANDOFF §5.3.2 表格)。违反必回归到 v12 PoC #2 之前 69% 召回率
- 5 路用同一个 active mllm provider,不要拆 provider
- `bbox` 必须满足 `x+w ≤ 1` / `y+h ≤ 1`;prompt 已约束,但 mllm 偶尔违反 — `clamp01` + `normalizeBboxes` 兜底

---

## 7. Phase 5 — Pass 2 单 category 调用(打通 image_gen 链路)

> **退出准则**:Pass 2 输出 `data/pass2/{state}-{cat}.png` 是 #00FF00 绿幕 + 元素分散;chroma key 后 `data/keyed/...` 内部白色保留;slicer 切出 N 个 PNG,Asset Review 列表显示。

### 动作

1. `src/lib/bbox-crop.ts`:`cropFromBbox(rawBuf, bbox)` 用 sharp `extract`,归一化坐标 → 像素坐标
2. `src/lib/pass2-runner.ts`(简版):**所有 type=static 元素扔一路**,不分 category;**单参考图**(只传原图)
3. `src/lib/prompts/render-pass2-route.ts`:HANDOFF §6.3.1 模板逐字;`renderElementSummary` 按 name 分组(HANDOFF §6.3.2)
4. `src/lib/alpha-key.ts`:chroma green key(HANDOFF §8.1 完整);测试:绿幕 PNG → 透明 PNG
5. `src/lib/slicer.ts`:**移植 `archive/ref/split_elements.py`**,逐函数对照:
   - alpha mask: `alpha > 10`
   - `binary_dilation`(3×3 8-connectivity 结构元,~30 行 JS)
   - `connected_component_label`(two-pass union-find,~50 行)
   - bbox + padding + min_size + min_opaque_pct 过滤
   - **不引** OpenCV / scipy
6. API:`POST /api/states/[id]/pass2`、`GET /api/states/[id]/slices/...`
7. UI:state 详情页"运行 Pass 2"按钮(前置 pass1_done && 所有 element.reviewed),完成后跳 Asset Review

### 关键陷阱

- §6.3.2 prompt 措辞硬约束:**严禁** `pixel-faithfully` / `MUST` / 直接出 transparent / 塞 entity_name+JSON
- §13.6:**严禁**让 model 出 transparent / 白底 — 必须绿幕
- §13.2:**不**要求保持原坐标 — prompt 必须明示"元素之间留出至少一整个元素宽度的空隙"
- slicer **从原 RGBA buffer crop**,不从 dilated mask crop

---

## 8. Phase 6 — Pass 2 多参考图 + 按 category 分组并行

> **退出准则**:Element Review 拖框改 bbox → 重跑 Pass 2 → **该 element 的 crop 复刻新位置**(image-edit 按新 crop 工作,不 regenerate)。故意 button 路 timeout(改 max_attempts=2)→ 其他 5 路完成,button 路 elements 全标 failed,UI 提示重抠。

### 动作

1. `pass2-runner.ts` 改造:按 `visual_category` 分组,`Promise.allSettled` 6 路;每路独立 sub-run
2. 每路传多参考图 `[原图, ...el_crops]`(HANDOFF §6.2);prompt 用「参考图 #N」编号引用,**不**用 entity_name
3. `image_urls` 数组:index 0 = 主图,1..N = 各 element 的 crop;`callImageGen({ reference_image_base64, reference_image_base64s })` 喂入
4. **部分失败容忍**(HANDOFF §6.1):单路失败 → 该路 elements 标 `asset.status='failed'`,其他路正常 → 总 run 仍 completed
5. 单 element crop 失败(NaN bbox / 0 面积)→ 跳过该 element 不阻断该路;若该路所有 element crop 都坏 → fail 该路 sub-run(不抛出)
6. `re_extract` 单元素重抠用 1-shot 单图模板(`DEFAULT_PASS2_EXTRACT`),`/api/elements/[id]/re-extract`

### 关键陷阱

- `category_cn` 映射(§6.3.1)必须用 — 中文 prompt 自然度对模型表现影响显著
- `pageDescription` 取 `project.description ?? page.name`
- 6 路是否都跑取决于该 state 有没有该 category 的 type=static 元素 — 没有的 category 跳过(不调 image_gen)

---

## 9. Phase 7 — 切片产物落盘 + 用户全手动指派 + 手动 crop(MVP S3)

> **退出准则**:Pass 2 完成后所有 element 处于"无 asset"状态;Asset Review 左 grid 显示该 page 全部切片缩略图,用户拖切片到右侧 element 卡片完成指派;指派后 asset 立即落 `data/assets-bin/{element-id}.png`,卡片刷新预览;遇到"两个 element 被合并到一张切片"的 case,用户能在切片上手动画框再切。

### 与 HANDOFF §6.7 / PR #25 的偏离

HANDOFF 设计了 SliceManifest 中间层 + 默认 (y, x) 自动指派 + 「换切图」改派。MVP **去掉自动指派、去掉 manifest 文件**,走全手动 + **加手动 crop 工具**:

| 项 | HANDOFF §6.7 | MVP S3 |
|---|---|---|
| 切片落盘 | `data/slices/{state}-{cat}/{idx}.png` + manifest.json | 同左,**无 manifest** |
| Pass 2 完成后 | 默认 (y, x) 指派 → 自动生成 N 个 Asset | **不创建 Asset**,全部 element 状态 `no_asset` |
| 指派关系存哪 | 独立 SliceManifest | Asset 自身 `slice_source: { state_id, category, idx }`,反查"该 (s,c,i) 当前哪些 asset 引用"扫一遍 assets 即可 |
| Asset Review UI | 卡片自动配 asset,不满意点「换切图」 | 左切片 grid + 右 element 列表,拖拽 / 点选指派 |
| **多 element 被合并切片** | 无解,只能重跑 Pass 2 碰运气 | **新增手动 crop**:用户在切片大图上画框,后端按框再切,新切片追加到该 category(原切片保留) |
| 重抠路径 | 新切片自动替换旧 asset | 单元素重抠产物只 1 张,无歧义,自动指派给该 element |

### 动作

1. `src/lib/slices.ts`(精简版):
   - `writeSlice(stateId, category, idx, buffer)` → `data/slices/{state}-{cat}/{idx}.png`
   - `listSlices(stateId)` 扫目录返回所有 `{ state_id, category, idx, path, w, h, opaque_pct }`(opaque_pct 切片时算好缓存到 sidecar `{idx}.json`)
   - `nextSliceIdx(stateId, category)`:扫目录返回下一个可用 idx(支持 crop / 重抠追加切片)
   - `getSliceImage(stateId, category, idx)` 读 buffer
   - `assignSliceToElement(elementId, sliceSource)`:
     1. copy slice PNG → `data/assets-bin/{element_id}.png`
     2. `createOrUpdateAsset(elementId, { slice_source, status: 'extracted', width, height, alpha_quality })`
     3. **不**清同 idx 的其他 asset(MVP S3 允许一切片指派给多 element,copy 多次)
   - `unassignAsset(elementId)`:删 assets-bin 文件 + 删 Asset(用户拖走指派想"清空"时用)
   - **`subCropSlice(stateId, category, idx, rects)`**(新):对原切片 PNG 按用户给的多个像素 bbox 各 crop 出一张子图 → 用 `nextSliceIdx` 依次追加写入。原切片**不动**(保留)。返回新切片 metadata 列表
2. `pass2-runner.runRoute` 改造:chroma key + slice → **只**走 `writeSlice`,**不**调 `createOrUpdateAsset`
3. **Asset 数据模型扩展**:`Asset` 加 `slice_source?: { state_id: string, category: VisualCategory, idx: number }` 字段
4. API:
   - `GET /api/states/[id]/slices` → `{ slices: SliceInfo[] }`
   - `GET /api/states/[id]/slices/[category]/[idx]` → 直接返回切片 PNG
   - `POST /api/elements/[id]/assign-slice` body `{ state_id, category, idx }` → `{ asset: Asset }`
   - `DELETE /api/elements/[id]/asset` → 204(撤销指派)
   - **`POST /api/states/[id]/slices/[category]/[idx]/sub-crop`**(新)body `{ rects: Array<{ x: number, y: number, w: number, h: number }> }` (像素坐标,相对原切片图)→ `{ created: SliceInfo[] }`
5. UI: Asset Review 大改,切片缩略图 hover 显示「✂ 切」入口 → 全屏 dialog 上画框确认。详见 §17.6 草图

### 关键陷阱

- 一切片指派给多 element(用户场景:同一切片是两个相似 element 的源)→ copy 多次,各自独立 Asset。指派时**不**冲突检查
- 切片 PNG **永不删**(用户可能拖错想换回去,sub-crop 后也想看原图对比)。仅在该 state 整个被删时清目录
- Asset 反查"未指派的切片":`listSlices(stateId)` ∩ NOT EXISTS `assets.slice_source`。无须独立 manifest
- 单元素重抠:`/api/elements/[id]/re-extract` 完成后,单切片产物自动调 `assignSliceToElement` 指派给该 element(无歧义,例外条款)
- sub-crop 的 rects **不要**做服务端"自动检测连通域再切" — 用户场景就是 chroma 切错合并的 case,自动检测多半没用,直接用用户给的框
- sub-crop 后的新切片是普通切片,可再次 sub-crop(允许"切了再切")

---

## 10. Phase 8 — 反向校验 + Asset Review 单元素重抠

> **退出准则**:故意把某 element 的 keyed 区域涂个绿点 → validate 标 contamination=true → UI 警告。重抠后 asset 替换成功,validate 重跑警告消失。

### 动作

1. `src/lib/prompts/render-validate.ts`:HANDOFF §6.4 prompt 拼装(canonical_image + keyed_png + elements_json)
2. `validate` API `/api/states/[id]/validate`(HANDOFF §4.3)
3. 解析 → `alpha_quality` / `complete` / `style_match` / `contamination` / `notes` 写入 Asset
4. UI:Asset Review 卡显示质量警告 chip(complete=false → 红;contamination=true → 黄;alpha_quality < 0.7 → 黄)
5. 「重抠」按钮 → POST `/api/elements/[id]/re-extract` → 走 1-shot 单图 prompt

### 关键陷阱

- §6.4:**反向校验不阻断**,仅给提示。即使全员校验失败,用户仍可上传 CDN(用户主权 > LLM 判断)
- 唯一阻断的是 `status='failed'`(Pass 2 没产出)

---

## 11. Phase 9 — 抠图 API fallback(可选,HANDOFF §7.7 / PR #26)

> **抠图对象 = Pass 2 输出的整张元素拆分图**(`data/pass2/{state}-{cat}.png`,绿幕 #00FF00 背景 + 多元素分散排布的那张)。**不重发** image_gen,直接复用绿幕底片走 koukoutu API 重抠 → 透明 PNG → 重切片。
>
> **退出准则**:本地 chroma key 边缘有微弱半透残留的 case → 点「用 API 抠图」→ 干净。停 koukoutu(改 base_url)→ 全失败抛错,旧 chroma 结果保留(asset 不动)。

### 数据流(显式)

```
触发: 用户在 Asset Review 点「🩹 用 API 抠图」(state-level 全局按钮)
  │
  ├─ 找 active matting provider (kind=matting)
  ├─ listPass2GreenScreens(stateId) → [{category, buffer}, ...]    ← 复用 data/pass2/{state}-{cat}.png
  │     注意: 这是 Pass 2 阶段输出的整张多元素拆分图,不是单 element crop
  ├─ for each category:
  │     transparent = await callMatting(provider, { png: buffer })
  │     overwrite data/keyed/{state}-{cat}.png ← 覆盖原 chroma key 结果
  │     reSliceAndAssign(stateId, category, transparent)
  │       ├─ writeSlice 把新切片落盘(用 nextSliceIdx 追加,不覆盖旧切片)
  │       └─ 旧切片保留(用户可能想对比/退回)
  └─ 部分失败容忍 → 该 category 保留旧 chroma 切片不动
```

**关键**:抠图对象是 Pass 2 留底的**整张图**(包含该 category 全部元素的绿幕图),不是逐元素抠。一次 koukoutu 调用搞定一路,N 路就 N 次调用。

### 动作

1. `src/lib/matting-client.ts`:`callMatting(provider, { png })` koukoutu sync API,multipart/form-data,60s timeout,区分 JSON 错误 vs PNG bytes
2. `default-providers.ts` 加 `kind='matting'` seed
3. `/api/states/[id]/re-key-via-api`:复用 `data/pass2/{state}-{cat}.png` → 逐 category 调 callMatting → 覆写 keyed + 重切片(走 §9 `writeSlice` 追加,旧切片保留)
4. **state-level lock 复用 Pass 2 同一把锁**
5. UI:Asset Review 全局「用 API 抠图」按钮(state 级,见 §17.6);执行结果 toast(全成 / 部分成功 / 全失败)。新切片在切片库里追加显示,用户可主动指派替换

### 关键陷阱

- §13.7:**严守边界** — pipeline runner **不**要 import matting client;只有 `re-key-via-api` 路由 import
- `pingMatting` 不实现(koukoutu 没免费 ping endpoint),Settings UI 提示"请到 Asset Review 实测"

---

## 12. Phase 10 — CDN + Export

> **退出准则**:export 文件夹丢给 Claude Code,基于 spec.md + assets 写出贴合代码;manifest.json cdn_url 正确,未上传 asset cdn_url=null,coding agent 用本地 fallback。

### 动作

1. `src/lib/cdn-client.ts`:S3 包装(@aws-sdk/client-s3),`uploadAsset(asset, project_id, page_id)` → key `${project_id}/${page_id}/${asset.id}.png`
2. API:`POST /api/assets/[id]/upload`、`POST /api/pages/[id]/upload-all-assets`
3. `src/lib/exporter.ts`:HANDOFF §10 文件结构生成(folder + 可选 zip stream)
4. `spec.md` 渲染:HANDOFF §10.6 模板(元素表格 + 状态 diff + coding_agent_intro)
5. UI:page 详情页加「导出」按钮 → 选目录(填路径)/ 下载 zip
6. 同步上传 → asset.cdn_url + status='uploaded'

---

## 13. CLAUDE.md(Phase 1 创建,作为后续 session 的工作约束)

```md
# img2UI CLAUDE.md

## 工作准则
- HANDOFF.md(在 ../img2UI-archive/HANDOFF.md)是产品契约。§13 反直觉硬约束 + §5.3.1 / §6.3.1 / §6.3.2 / §6.4 prompt 模板 + 附录 A category 定义都是逐字照抄,不要"觉得更合理"地改写
- **MVP 简化决策见 PLAN §0.4**(单 state per page / 小元素过滤 / 切片全手动指派),与 HANDOFF 不一致以 PLAN §0.4 为准
- TS strict;不引额外抽象层(无 DI / repository / event bus);Route Handler 直接调 lib 函数
- 不引 Tailwind;UI 用 **MUI v6 + Emotion**;主题在 src/theme/index.ts 一处管理;主色 `#0d99ff`(Figma 蓝),其他 MD3 token(大圆角 16 / ripple / elevation 1→3)保留
- 文件 IO 都走 writeAtomic;并发用 src/lib/run-lock.ts 内存锁
- 不要在 pipeline runner / pass2-runner 里 import matting-client;只有 re-key-via-api 路由 import(§13.7)
- 看到 Pass 1 prompt 出现 EXCLUSIVE 措辞(`Return ONLY` / `Do NOT return others`)立即回滚(§13.8)
- Pass 2 完成 **不**创建 Asset(MVP S3),只 writeSlice;Asset 是用户在 Asset Review 拖切片到 element 时产生的
- apimart `quality` **全程 `'high'`**,不退到 medium

## 实测收敛参数(不许动)
- mllm: gemini-3.1-pro-preview / temperature=1 / max_tokens=32000 / thinking_budget=4096 / api_format=sankuai 无 Bearer
- image_gen: gpt-image-2-official(不是 backup gpt-image-2)/ quality=high / poll_max_attempts=60 / poll_initial_delay=12s
- chroma: full_alpha=60 / full_opaque=25 / spill suppression on
- slicer: gap=15 / padding=5 / min_size=30 / min_opaque_pct=1.0
- Pass 1 合并: IoU > 0.5,优先级 subject<button<container<background<decoration<other,≥3/5 才 done

## 不要做的事
- 不复用 archive/src/lib 任何代码
- 不重复 "三选一" 决策(已在 PLAN §1 定:MUI v6)
- 不引 OpenCV / scipy(slicer 自实现)
- 不在 PoC 评估时只看统计指标(必看 keyed/{state}-{cat}.png 实际像素质量)
```

---

## 14. UI 设计草案(Material Design 3,MUI v6)

### 14.1 整体布局

- **Top App Bar**(MUI `<AppBar>`):左 logo "img2UI" / 面包屑(Project › Page › State)/ 右 Settings 入口
- **Side Navigation**:仅在项目内部页面显示,展示当前项目的 page 树(可折叠);state 子节点显示 pipeline_status 颜色 chip
- **Main content**:RWD 三档(< 600 / 600-1240 / > 1240),`<Container maxWidth="xl">`
- **FAB**:列表页右下,新建项目 / 新建页面 / 上传

### 14.2 关键页面

| 页面 | 核心组件 | 视觉重点 |
|---|---|---|
| `/` 项目列表 | `<Card>` Grid + `<Skeleton>` loading + 缩略图 | MD3 大圆角(16px)、elevation 1 → hover elevation 3 |
| `/projects/[id]/pages/[pageId]` | **单图上传** dropzone(`<Paper variant="outlined">` dashed) + 已上传时显示原图缩略 + Pipeline 状态卡 | 状态 chip:idle 灰 / running primary + spin / done success / failed error |
| Element Review | bbox 叠加层(canvas)+ 右侧 element 表格 + 折叠"已过滤的小元素 (N)" | 拖拽改 bbox 用 react-rnd;选中卡片高亮 |
| Asset Review(MVP S3 全手动) | 左:切片 grid(按 category 分组,缩略图带 opaque_pct);右:element 列表(每行显示 description + 已指派 asset 预览或"未指派"占位) | 拖切片到 element 行 → 指派;再次拖另一切片 → 替换;指派后 chip 显示 alpha_quality / contamination 警告 |
| Settings/Providers | `<Accordion>` 每 provider 一栏 | active provider `<Badge color="primary">` |

### 14.3 Theme token(`src/theme/index.ts`)

```ts
// 主色 = Figma 蓝(替换 MD3 baseline 紫),其他 MD3 token 保留
// 用 Material Theme Builder 喂 #0d99ff 生成完整 12-token palette
palette: {
  primary:   { main: '#0d99ff' },           // Figma blue
  secondary: { main: '#5e6b7a' },           // 中性灰蓝(MD3 风,从主色派生)
  // 状态色保留 MUI 默认(success/warning/error/info)
}
shape: { borderRadius: 16 }                 // MD3 大圆角,Card 默认
typography: {
  fontFamily: '"Roboto", "PingFang SC", "Microsoft YaHei", sans-serif',
  // MD3 type scale: display/headline/title/body/label
}
components: {
  MuiButton:    { styleOverrides: { root: { borderRadius: 12, textTransform: 'none' } } },
  MuiChip:      { styleOverrides: { root: { borderRadius: 8 } } },
  MuiTextField: { defaultProps: { size: 'small' } },        // 紧凑感
  MuiCard:      { defaultProps: { elevation: 1 } },         // hover 时 sx 提到 3
}
```

CJK 字体显式 fallback。MD3 ripple / `<ButtonBase>` 默认 enable,不调。

### 14.4 不做的 UI 加法

- 不上深色模式(MVP 不需要)
- 不上动画库(framer-motion 等);MUI 自带 Fade/Grow/Collapse 够用
- 不上 i18n;UI 文案就是中文

---

## 15. 风险点 / 已知不确定项

| # | 风险 | 缓解 |
|---|---|---|
| R1 | Phase 1 三个 Test Connection 在你环境一次过(API key 能否拿到) | 第一动作就 Test Connection;失败 stop 不进 Phase 2 |
| R2 | MUI v6 + Next.js 15 RSC/SSR `<AppRouterCacheProvider>` 路径正确;`'use client'` 边界正确 | 用 `@mui/material-nextjs/v15-appRouter` 官方包跟官方 example |
| R3 | slicer 移植精度 — connected component 算法两次实现(Python vs TS)不必精确一致,只需"切出来的 element 数量与位置肉眼接受" | 用 archive 里的 keyed PNG 当 fixture 跑回归 |
| R4 | apimart 单图 ~$0.17,Phase 6 调试 6 路并发跑一次 ~$1。Phase 5/6/8 多次重跑成本不可忽视 | **全程 `quality='high'`**(用户决策:不接受 medium 字形漂的不确定性)。控成本靠"批量验证不重复跑":Phase 5 跑 1 次确认链路 → Phase 6 跑 1-2 次确认多参考图行为 → Phase 8 跑 1 次确认反向校验。预算 Phase 5-8 dogfood 总开销 < $30 |
| R5 | "完全忘记老 UI"——但你 review PLAN 时可能想起某些老 UI 局部体验是好的 | review 时随时告诉我,加进 §14 |

---

## 16. 决策固化(全部已敲定)

### 16.1 MVP 简化(§0.4)
- ✅ S1 — 每 page 只支持 1 张图(UI 限制单 state,后端数据模型保留)
- ✅ S2 — Pass 1 后处理过滤小元素,阈值相对面积 `< 0.001`
- ✅ S3 — 切片库去自动指派,全手动拖拽 + 切片 sub-crop 工具

### 16.2 偏离 HANDOFF
- ✅ §0.1 边界 — `archive/src/lib/*` 不复用;prompt 文本 / visual-category 定义 / split_elements 算法**逐字照抄 / 对照移植**
- ✅ §1.1 UI 框架 — **MUI v6 + Emotion**,主色 `#0d99ff` Figma 蓝替 MD3 baseline 紫,其他 MD3 token(大圆角 / ripple / elevation)保留;不引 Tailwind / shadcn / framer-motion
- ✅ §1.3 Phase 顺序按 HANDOFF §14 不改

### 16.3 路径 / 数据
- ✅ URL 不暴露 `stateId`(§17.8)— 前端从 page.canonical_state_id 自动派发,后端 API 仍按 stateId
- ✅ 一切片可指派给多 element(后端 copy 多次,各自独立 Asset)
- ✅ Asset 加 `slice_source: { state_id, category, idx }` 字段
- ✅ 切片 PNG 永不删,sub-crop 后原切片保留

### 16.4 实施 / 成本
- ✅ apimart `quality` **全程 `'high'`**,不接受 medium 字形漂的不确定性;控成本靠"批量验证 + 不重复跑"
- ✅ Phase 节奏 — **Phase 1-3 一气跑通后 stop**(脚手架 + CRUD + Pass 1 单路 LLM 调通,踩坑成本最低的检查点);Phase 4 之后每 phase 完成都 stop 等 review
- ✅ §13 CLAUDE.md 草稿整段接受

### 16.5 仍可微调(不影响开 Phase 1)
- 主色生成的完整 MD3 12-token palette(用 Material Theme Builder 喂 `#0d99ff` 生成,Phase 1 落地时一并定 hex 值)
- Element Review 拖拽组件选 react-rnd vs 自实现(Phase 4 落地时定)

---

**所有决策已固化。下一轮你说"开始 Phase 1"我就跑。** 不会再问。

---

## 17. UI ASCII 草图

> 画的是布局 / 信息层级 / 交互逻辑,**不**是视觉精度(MD3 圆角 / elevation / 颜色靠 MUI 默认)。横向尺寸按 ~1280px 桌面绘制。

### 17.1 全局壳

- **Top AppBar**:logo + 面包屑(`Project › Page › Stage`)+ 右侧 Settings
- **Side Nav**:进入项目后才出现,显示当前项目的 page 树 + Settings 入口;page 节点旁有 pipeline 状态 dot
- **Main**:页面主体

### 17.2 `/` 项目列表

```
╔══════════════════════════════════════════════════════════════════════════════╗
║ img2UI                                              Settings ⚙   Help ?     ║
╠══════════════════════════════════════════════════════════════════════════════╣
║                                                                              ║
║  我的项目                                                                    ║
║                                                                              ║
║  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    ║
║  │              │  │              │  │              │  │              │    ║
║  │   [缩略图]   │  │   [缩略图]   │  │   [缩略图]   │  │   [缩略图]   │    ║
║  │              │  │              │  │              │  │              │    ║
║  ├──────────────┤  ├──────────────┤  ├──────────────┤  ├──────────────┤    ║
║  │ 抽奖活动 H5  │  │ 双 11 主会场 │  │ 新人引导     │  │ 拉新活动     │    ║
║  │ 3 pages      │  │ 8 pages      │  │ 2 pages      │  │ 5 pages      │    ║
║  │ 2026-05-10   │  │ 2026-05-12   │  │ 2026-05-15   │  │ 2026-05-16   │    ║
║  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘    ║
║                                                                              ║
║                                                                       ┌──┐  ║
║                                                                       │ +│  ║
║                                                                       └──┘  ║
╚══════════════════════════════════════════════════════════════════════════════╝
```

### 17.3 项目详情 = 页面列表

```
╔══════════════════════════════════════════════════════════════════════════════╗
║ img2UI    抽奖活动 H5                               Settings ⚙   Help ?     ║
╠════════════════╦═════════════════════════════════════════════════════════════╣
║ 抽奖活动 H5    ║                                                              ║
║                ║   页面                                                       ║
║ ▼ Pages        ║                                                              ║
║   • 入口页 ●   ║   ┌────────────────┐  ┌────────────────┐  ┌──────────────┐  ║
║   • 抽中页 ◌   ║   │                │  │                │  │              │  ║
║   • 未中页 ◌   ║   │   [缩略图]     │  │   [缩略图]     │  │   [缩略图]   │  ║
║                ║   │                │  │                │  │              │  ║
║ Settings       ║   ├────────────────┤  ├────────────────┤  ├──────────────┤  ║
║   Providers    ║   │ 入口页         │  │ 抽中页         │  │ 未中页       │  ║
║   Prompts      ║   │ /lottery       │  │ /lottery/win   │  │ /lottery/lose│  ║
║                ║   │ pass2_done  ●  │  │ idle        ◌  │  │ idle      ◌  │  ║
║                ║   └────────────────┘  └────────────────┘  └──────────────┘  ║
║                ║                                                       ┌──┐  ║
║                ║                                                       │ +│  ║
║                ║                                                       └──┘  ║
╚════════════════╩═════════════════════════════════════════════════════════════╝
```

`●` = pass2_done · `◌` = idle · `🟡` = running · `🔴` = failed(MUI Chip 颜色,这里用 ASCII 近似)

### 17.4 页面详情(单图上传 + Pipeline 状态)

未上传:

```
╔══════════════════════════════════════════════════════════════════════════════╗
║ img2UI   抽奖活动 H5 › 抽中页                       Settings ⚙   Help ?     ║
╠════════════════╦═════════════════════════════════════════════════════════════╣
║ 抽奖活动 H5    ║                                                              ║
║                ║   抽中页    路由: /lottery/win                               ║
║ ▼ Pages        ║                                                              ║
║   • 入口页 ●   ║   ┌─────────────────────────────────────────────────────┐  ║
║   • 抽中页 ◌   ║   │                                                     │  ║
║   • 未中页 ◌   ║   │       拖拽 PNG 到此处  或  [📁 选择文件]            │  ║
║                ║   │                                                     │  ║
║ Settings       ║   │       (每个页面仅支持 1 张设计稿)                   │  ║
║   Providers    ║   │                                                     │  ║
║   Prompts      ║   └─────────────────────────────────────────────────────┘  ║
║                ║                                                              ║
╚════════════════╩═════════════════════════════════════════════════════════════╝
```

已上传:

```
╔══════════════════════════════════════════════════════════════════════════════╗
║ img2UI   抽奖活动 H5 › 抽中页                       Settings ⚙   Help ?     ║
╠════════════════╦═════════════════════════════════════════════════════════════╣
║ 抽奖活动 H5    ║                                                              ║
║                ║   抽中页    路由: /lottery/win        [🔄 重新上传]         ║
║ ▼ Pages        ║                                                              ║
║   • 入口页 ●   ║   ┌─────────────────────────┐  ┌────────────────────────┐  ║
║   • 抽中页 ◌   ║   │                         │  │ Pipeline               │  ║
║   • 未中页 ◌   ║   │                         │  │                        │  ║
║                ║   │      [设计稿原图        │  │  ✓ Pass 1     done     │  ║
║ Settings       ║   │       预览,等比缩放]    │  │  ◌ Element Review      │  ║
║   Providers    ║   │                         │  │  ◌ Pass 2              │  ║
║   Prompts      ║   │                         │  │  ◌ Asset Review        │  ║
║                ║   │                         │  │  ◌ Validate            │  ║
║                ║   └─────────────────────────┘  │  ◌ Upload CDN          │  ║
║                ║                                │  ◌ Export              │  ║
║                ║   [▶ Element Review]           │                        │  ║
║                ║                                └────────────────────────┘  ║
╚════════════════╩═════════════════════════════════════════════════════════════╝
```

主按钮在最左下,跟着 pipeline 推进文案变("运行 Pass 1" → "Element Review" → "运行 Pass 2" → ...)。右侧时间线 chip 颜色对应状态。

### 17.5 Element Review

```
╔══════════════════════════════════════════════════════════════════════════════════╗
║ img2UI  抽奖活动 H5 › 抽中页 › Element Review        Settings ⚙   Help ?       ║
╠════════════════╦═════════════════════════════════════════════════════════════════╣
║                ║                                                                  ║
║  Elements (24) ║   ┌──────────────────────────┐  ┌──────────────────────────┐  ║
║  全部 / 未确认 ║   │ ▢ 设计稿 + bbox 叠加层   │  │ 选中元素                  │  ║
║  ────────────  ║   │                          │  │                           │  ║
║  ┌──────────┐  ║   │  ┌──────────┐            │  │ 名称  卡通娃娃            │  ║
║  │● 卡通娃娃 │  ║   │  │ 主体     │ ← 拖拽    │  │ 类型  ◉ static  ○ code   │  ║
║  │ static   │  ║   │  │ SUBJECT  │   重定位  │  │ 分类  subject ▾           │  ║
║  │ subject  │  ║   │  └──────────┘            │  │                           │  ║
║  └──────────┘  ║   │       ┌────┐             │  │ 描述                      │  ║
║  ┌──────────┐  ║   │       │按钮│             │  │ ┌─────────────────────┐  │  ║
║  │○ "幸运签"│  ║   │       │BTN │             │  │ │ 蓬松云朵头发的卡通  │  │  ║
║  │ static   │  ║   │       └────┘             │  │ │ 娃娃,蓝色羽绒服,粉  │  │  ║
║  │ subject  │  ║   │           ┌──────┐       │  │ │ 色围巾,胸前抱礼盒   │  │  ║
║  └──────────┘  ║   │           │ 容器 │       │  │ └─────────────────────┘  │  ║
║  ┌──────────┐  ║   │           │CONT  │       │  │                           │  ║
║  │○ 抽奖按钮 │  ║   │           └──────┘       │  │ bbox (px)                 │  ║
║  │ static   │  ║   │                          │  │ x:128 y:240 w:380 h:420  │  ║
║  │ button   │  ║   │  ⊕ 拖拽 bbox 边角调整    │  │                           │  ║
║  └──────────┘  ║   │  ⊗ 点击删除元素          │  │ z-index  5                │  ║
║   ...          ║   └──────────────────────────┘  │                           │  ║
║                ║                                  │ [✓ 确认]    [🗑 删除]    │  ║
║  ▶ 已过滤的    ║                                  └──────────────────────────┘  ║
║    小元素 (3)  ║                                                                  ║
║  ────────────  ║   ┌────────────────────────────────────────────────────────┐  ║
║                ║   │ 全部 24 个元素都确认后:           [▶ 运行 Pass 2]      │  ║
║  [全部确认]    ║   └────────────────────────────────────────────────────────┘  ║
╚════════════════╩═════════════════════════════════════════════════════════════════╝
```

- 左 sidebar 列 elements,实心圆点 = 已确认,空心圆点 = 待确认
- 中间 canvas 显示原图 + 半透明 bbox 叠加(每 element 一框,选中高亮)
- 右侧详情面板编辑选中 element 的 type / category / description / bbox(数值或拖动)
- 「已过滤的小元素」是 §0.4 S2 的折叠区,默认收起

### 17.6 Asset Review(MVP S3 全手动指派)— **关键页**

```
╔════════════════════════════════════════════════════════════════════════════════════╗
║ img2UI  抽奖活动 H5 › 抽中页 › Asset Review     Settings ⚙   Help ?              ║
╠════════════════╦═══════════════════════════════════════════════════════════════════╣
║                ║                                       [🩹 用 API 抠图]  [↪ 重抠]  ║
║                ║                                                                    ║
║                ║  ┌────── 切片库 (15) ──────────┐  ┌────── 元素列表 (8 静态) ────┐ ║
║                ║  │                             │  │                              │ ║
║                ║  │ ▼ subject (3)               │  │ ╭─ 卡通娃娃 ───────────────╮│ ║
║                ║  │   ┌────┐ ┌────┐ ┌────┐      │  │ │ static · subject         ││ ║
║                ║  │   │[🐻]│ │[字]│ │[图]│      │  │ │  ┌────┐                  ││ ║
║                ║  │   │ #0 │ │ #1 │ │ #2 │      │  │ │  │[🐻]│  α=0.93  ✓       ││ ║
║                ║  │   │93% │ │88% │ │76% │      │  │ │  │ #0 │  α 0.93           ││ ║
║                ║  │   └────┘ └────┘ └────┘      │  │ │  └────┘                  ││ ║
║                ║  │                             │  │ │                  [🗑撤销]││ ║
║                ║  │ ▼ button (2)                │  │ ╰──────────────────────────╯│ ║
║                ║  │   ┌────┐ ┌────┐             │  │                              │ ║
║                ║  │   │[btn]│ │[btn]│            │  │ ╭─ "幸运签" 标题 ──────────╮│ ║
║                ║  │   │ #0 │ │ #1 │             │  │ │ static · subject         ││ ║
║                ║  │   │92% │ │84% │             │  │ │  ┌────┐                  ││ ║
║                ║  │   └────┘ └────┘             │  │ │  │ ?  │ ← 拖切片到此     ││ ║
║                ║  │                             │  │ │  └────┘   或 [↪ 重抠]    ││ ║
║                ║  │ ▼ decoration (5)            │  │ ╰──────────────────────────╯│ ║
║                ║  │   ┌────┐ ┌────┐ ┌────┐      │  │                              │ ║
║                ║  │   │[★] │ │[彩]│ │[贴]│      │  │ ╭─ 抽奖按钮 ────────────────╮│ ║
║                ║  │   │ #0 │ │ #1 │ │ #2 │      │  │ │ static · button          ││ ║
║                ║  │   └────┘ └────┘ └────┘      │  │ │  ┌────┐  ⚠ contamination ││ ║
║                ║  │   ┌────┐ ┌────┐             │  │ │  │[btn]│ α=0.62           ││ ║
║                ║  │   │[星]│ │[云]│             │  │ │  │ #0 │ ━━━━━━━━━━━━━━━ ││ ║
║                ║  │   │ #3 │ │ #4 │             │  │ │  └────┘ [换] [↪ 重抠]    ││ ║
║                ║  │   └────┘ └────┘             │  │ ╰──────────────────────────╯│ ║
║                ║  │                             │  │                              │ ║
║                ║  │ ▶ container (3)             │  │ ╭─ 礼盒 ────────────────────╮│ ║
║                ║  │ ▶ background (2)            │  │ │ ...                       ││ ║
║                ║  │                             │  │ ╰──────────────────────────╯│ ║
║                ║  │ 边框颜色:                   │  │                              │ ║
║                ║  │ □ 灰=未指派                 │  │  ...还有 4 个                │ ║
║                ║  │ ■ 蓝=当前选中已用           │  │                              │ ║
║                ║  │ ■ 橙=别的 element 已用      │  │                              │ ║
║                ║  │  (允许重复指派,会 copy)    │  │                              │ ║
║                ║  └─────────────────────────────┘  └──────────────────────────────┘ ║
║                ║                                                                    ║
║                ║  全部 8 个元素都已指派后:                       [▶ 上传 CDN]      ║
║                ║                                                                    ║
╚════════════════╩═══════════════════════════════════════════════════════════════════╝
```

**核心交互**:
- 左 grid 按 visual_category 折叠分组,每切片缩略图带 idx + opaque_pct
- 右列表是该 page 全部 type=static 的 element,每行显示已指派的 asset 预览(`?` 占位 = 未指派)
- 拖切片到 element 行 → 后端 `assignSliceToElement` → asset 立即落盘 + 行刷新
- 已指派的 element 拖另一切片来 = 替换(撤销旧 asset 文件)
- 同一切片可拖给多 element(后端 copy 多次,各自独立 Asset)
- 切片框颜色实时更新:被当前选中 element 引用 → 蓝;被别的 element 引用 → 橙;无引用 → 灰
- 切片缩略图 hover 显示 `✂ 切` 角标 → 进入 sub-crop 对话框(§17.6.1)
- "重抠"按钮 → re_extract 单元素 → 完成后该 element 自动获得新 asset(单切片无歧义)
- 顶部全局「🩹 用 API 抠图」走 §11 koukoutu fallback;**抠图对象是 Pass 2 留底的整张元素拆分图(每 category 一张)**,不重发 image_gen

### 17.6.1 切片 sub-crop 对话框

场景:某切片把两个挨太近的 element 合并了(chroma key 后 connected component 把它们当一块),用户想再切一刀。

```
╔════════════════════════════════════════════════════════════════════════════╗
║  ✂  切片 sub-crop  · subject #2                                  [✕]      ║
╠════════════════════════════════════════════════════════════════════════════╣
║                                                                            ║
║   工具: [▭ 画框]  [↩ 撤销]  [全部清空]    已画 2 个框                      ║
║                                                                            ║
║   ┌────────────────────────────────────────────────────────────────┐      ║
║   │                                                                │      ║
║   │       ┌─────────┐                                              │      ║
║   │       │ 框 #1   │   ← 鼠标拖拽生成,可改大小/移动              │      ║
║   │       │ [🐻]    │                                              │      ║
║   │       │         │                                              │      ║
║   │       └─────────┘                                              │      ║
║   │                                                                │      ║
║   │                          ┌─────────────┐                      │      ║
║   │                          │   框 #2     │                       │      ║
║   │                          │  [字体]     │                       │      ║
║   │                          │             │                       │      ║
║   │                          └─────────────┘                       │      ║
║   │                                                                │      ║
║   │   (透明背景 = 棋盘格,展示原切片)                              │      ║
║   └────────────────────────────────────────────────────────────────┘      ║
║                                                                            ║
║   提示: 原切片 #2 会保留;按框各生成一张新切片追加到 subject 类             ║
║                                                                            ║
║                                  [取消]    [✂ 切出 2 个新切片]           ║
╚════════════════════════════════════════════════════════════════════════════╝
```

- 全屏 `<Dialog>` 显示原切片大图(透明背景棋盘格)
- 用户拖鼠标画矩形(react-rnd 或 canvas+鼠标事件),可画多个,可改尺寸 / 移动 / 删除
- 确认后调 `POST /api/states/[id]/slices/[cat]/[idx]/sub-crop` body `{ rects: [...] }`
- 后端按框 crop,新切片用 `nextSliceIdx` 追加;原切片**不动**
- 关闭 dialog 后切片库刷新,subject category 下出现 #N、#N+1 新切片;用户拖到对应 element 完成指派

### 17.7 Settings / Providers

```
╔══════════════════════════════════════════════════════════════════════════════╗
║ img2UI    Settings › Providers                      Settings ⚙   Help ?     ║
╠══════════════════════════════════════════════════════════════════════════════╣
║                                                                              ║
║  Providers                                                                   ║
║                                                                              ║
║  ┌─────────────────────────────────────────────────────────────────────┐    ║
║  │ ▼  ⚫ MLLM · sankuai Gemini 3.1 Pro (default)            [active]   │    ║
║  ├─────────────────────────────────────────────────────────────────────┤    ║
║  │   名称        [sankuai Gemini 3.1 Pro (default)               ]     │    ║
║  │   API 格式    [sankuai ▾]                                           │    ║
║  │   Base URL    [https://aigc.sankuai.com/v1/openai/native      ]     │    ║
║  │   API Key     [sk-***xxxx                                     ] 👁   │    ║
║  │   Model       [gemini-3.1-pro-preview                         ]     │    ║
║  │   Temp [1.0  ]    Max tokens [32000  ]    Thinking budget [4096]    │    ║
║  │                                                                     │    ║
║  │              [💾 保存]    [⚡ Test Connection]    [🗑 删除]          │    ║
║  └─────────────────────────────────────────────────────────────────────┘    ║
║                                                                              ║
║  ┌─────────────────────────────────────────────────────────────────────┐    ║
║  │ ▶  ⚫ Image Gen · apimart gpt-image-2-official (default) [active]   │    ║
║  └─────────────────────────────────────────────────────────────────────┘    ║
║                                                                              ║
║  ┌─────────────────────────────────────────────────────────────────────┐    ║
║  │ ▶  ⚫ CDN · Self-hosted S3                              [active]    │    ║
║  └─────────────────────────────────────────────────────────────────────┘    ║
║                                                                              ║
║  ┌─────────────────────────────────────────────────────────────────────┐    ║
║  │ ▶  ⚪ Matting · koukoutu (manual fallback)              [inactive]  │    ║
║  └─────────────────────────────────────────────────────────────────────┘    ║
║                                                                              ║
║                                              [+ 添加 Provider]               ║
╚══════════════════════════════════════════════════════════════════════════════╝
```

每类只能 1 个 active(checkbox 触发后端把同类其他 active=false)。Test Connection 内联展示结果(成功 ✓ 200 + 延迟 / 失败 ✗ + error message)。

### 17.8 顶层导航逻辑

| 路径 | 出现 SideNav? | 主操作 |
|---|---|---|
| `/` | ✗ | 浏览 / 新建项目 |
| `/projects/[id]` | ✓(项目下 page 树) | 浏览 / 新建 page |
| `/projects/[id]/pages/[pageId]` | ✓ | 上传 / 启动 pipeline |
| `/projects/[id]/pages/[pageId]/element-review` | ✓ | 修 element(Pass 1 之后) |
| `/projects/[id]/pages/[pageId]/asset-review` | ✓ | 拖切片指派(Pass 2 之后) |
| `/settings/providers` | ✗ | provider CRUD |
| `/settings/prompts` | ✗ | 4 份 prompt 模板编辑 |

URL 路径**不**暴露 `state-id`(MVP S1 单 state per page),前端 effective state = page.canonical_state_id。后端 API 仍按 `state-id` 走(数据模型不动)。

