# Changelog

All notable changes to img2UI are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), version numbers are loose milestones (no semver — no external consumers).

## [Unreleased]

### Fixed — 测试隔离 P0(用户 data/ 被五件套清空)

**根因**:`src/lib/fs-utils.ts` 把 `DATA_ROOT` 永远指向 `process.cwd() + /data`,vitest 跑测试时 cwd = 项目根目录 → 测试中的 `DATA_ROOT` 直接指向用户**真实** data/。8 个测试文件(`pages-thumbnail` / `pages` / `projects` / `pipelines` / `thumbnails` / `list-thumbnail-urls` / `states` / `thumbs-route`)都有 `afterEach(async () => { await fs.rm(DATA_ROOT, { recursive: true, force: true }) })`,所以**每次跑 `npm test` 都会把用户真实 data/(projects / pages / states / raw / thumbs / pipelines / config.json / ...) 整个 rm -rf**。dogfood round 4/5 期间被五件套删了 4+ 次。vitest.config.ts 注释明确说「多个测试文件共享 data/ 目录,afterEach 清理会互相干扰 → 串行跑」,但完全没意识到"共享 data/" 是用户真实数据。

**修复**:`fs-utils.ts` 检测 `process.env.VITEST`,vitest 环境下 `DATA_ROOT` 指向 `os.tmpdir()/img2ui-test-{pid}`,测试自然隔离,不动用户真实 data/。8 个测试文件零改动。验证:在 data/ 放 sentinel → 跑 npm test → 194 测试全过 + sentinel 完好。

### Fixed — Element Review default filters + bbox 异常警告

over-include 架构在密集页面识别 96+ 元素,Element Review list 太长用户挨个调 = 灾难。**保留 over-include 召回率(92%)不动**,仅在 UI 层加默认 filter 保护用户:

- **`element-list.tsx`**:顶部新增两个默认 ON 的 toggle:`只看静态切图`(过滤 type=code,异形容器/文字块由 coding agent 直接消费)+ `隐藏小碎片(<0.5% 面积)`(over-include 噪声主源)。附摘要 `显示 N / total` + 「显示全部」一键 reset(只在有过滤时出现)。两个 toggle 独立,filter 链最后仍保留原有 6 类 visual_category 和 tab。
- **`bbox-warning.ts`**(新)+ 列表项 inline icon:4 类 bbox 异常自动检测,error 红 ⚠️ / warning 黄 ℹ️ + hover 看 reason。检测 (a) 越界 (x+w>1 或 y+h>1)、(b) 仅单路识别(`pass1_routes_seen.length == 1`)、(c) 长宽比 > 20:1、(d) 面积 < 0.0001。error 优先级高于 warning。

## [0.2.1] — 2026-05-14 · 服务端真异步触发 + Phase 8f Pass 2 修复 + dogfood round 5

v0.2.0 tag 后端到端 dogfood 暴露的服务端 P0(Pass 1/2 触发同步阻塞)+ Pass 2 多路并发 P0 bugs + 3 处 UX 卡点修复。无能力变化。

### Fixed — 服务端真异步触发(根因级 bug)

`/api/states/[id]/pass{1,2}/route.ts` 此前 `await runPass{1,2}(stateId)` 阻塞 60-220s 才返回 202(语义错误,状态码已经是 Accepted)。前端 `Promise.all(triggerPass1Api...)` 把整个上传 + Pass 1 串成同步链,upload dialog 转一分钟才关。

改成 fire-and-forget(`void runner(...).catch(log)` + 立即 `202 { status: accepted }`)。runner 内部已用 `setPipelineStatus` 维护状态,前端 page detail 现成 2s 轮询能感知。本地 Node 进程长驻,fire-and-forget 不会被 kill。

**API 不兼容**:`triggerPass1Api` 返回类型 `{ run_id }` → `{ status }`;`triggerPass2Api` 返回类型 `{ run_id, created_assets }` → `{ status }`。Asset Review 的「Run Pass 2」toast 文案改成「已触发,后台跑约 60-220s」(此前显示「Pass 2 完成产出 N 个 asset」是骗人的,根本没等到完成)。

### Fixed — Phase 8f Pass 2 P0 bugs(QA 阻断级)

QA playwright 全流程实测出来 2 个 P0 bug:Pass 2 完全跑不出 asset。定向修复(PR #18)。

- **BUG #1:零面积 / 越界 bbox 让整路 Pass 2 全军覆没**(`bbox-crop.ts` + `pass2-runner.ts` + `render-pass1-route.ts`)。Pass 1 偶尔回 status_bar bbox=`[1, 0.113, 0.237, 0.068]`(x=1.0 越界),`cropFromBbox` clamp 后 width=0 throw → subject 路 10 个元素都没产出。修 3 处:(a) `cropFromBbox` 激进 clamp 把 x/y 限到 [0, 1-1px),width/height 至少 1 像素,只有 NaN/真零面积才抛;(b) `pass2-runner` 单 element crop 失败标 `failed` asset + 用剩下 valid elements 继续走 image_gen,不阻断该路;(c) Pass 1 prompt 头加 `x + w ≤ 1 / y + h ≤ 1` 约束 + 全屏元素正确写法举例
- **BUG #2:apimart `poll_max_attempts: 24` 不够,Pass 2 多路并发普遍超时**(`seeds/default-providers.ts` + `llm-client.ts` + `settings/models/page.tsx`)。实测 image_gen 单次 ~150-220s+,4 路并发拥挤可能 3-15 分钟,24 × 5s = 120s 太短。修 3 处:(a) 默认 seed 24 → 60(5 分钟兜底);(b) UI 新建 image_gen provider 默认 60;(c) `llm-client.ts` apimart polling 现在读 `provider.poll_max_attempts / poll_interval_seconds / poll_initial_delay_seconds`(此前完全忽略),fallback 60 / 5s / 12s

### dogfood round 5(PR #19)

- **新建页面 + 上传合并**(`new-page-dialog.tsx`):dialog 加文件 picker + 状态名/canonical 行内编辑(复用 `upload-states-dialog` 结构),一次提交先 createPage → 再 uploadStates → fire-and-forget 触发 Pass 1 → 跳详情页。`upload-states-dialog` 保留作为详情页「补传更多设计稿」入口
- **Element Review 批量 reviewed + 完成引导**(`elements/page.tsx`):顶部 nav 常驻「已 review N / M」+「全部标记 reviewed」按钮(一键标 draft 触发 dirty);全部 reviewed 且非 dirty 时显示 `→ 去「资产 Review」触发 Pass 2` 链接

## [0.2.0] — 2026-05-14 · Phase 8 v12 多路 Pass + 拖框生效化 + dogfood round 4

### Added — Phase 8 v12 多路 Pass + 拖框生效化

dogfood 反馈四件套(Pass 1/2 1-shot 不准 / 列表无缩略图 / chroma key 性能担忧 / 拖框无效)的定向修复。一套 v12 架构:Pass 1+2 都按 5 类 visual_category 并行,bbox crop 喂 Pass 2 当多参考图,**拖框终于生效**。

**Pass 1 改造**(PR #13,8 commits):
- Pass 1 从 1-shot 改为 5 路并行 mllm(subject / button / container / background / decoration),`Promise.allSettled` + `MIN_SUCCESS_ROUTES = 3` 容忍
- 每路用 over-include + CATEGORY_EXAMPLES 锚定的 prompt 头(PoC #2 v3 锁定)。**反例**:v2 「DO NOT return others」措辞实测召回退化到 69%,**正解**:删 EXCLUSIVE 限制 + 鼓励重叠 + 下游 IoU 0.5 dedup → 召回 12/13 = 92%
- Element schema 加 `visual_category` + `pass1_routes_seen?`,PipelinePassKind 扩展 sub-kinds
- 跨 state 合并改用 IoU > 0.5(替代 entity_name)
- 新增 `lib/visual-category.ts` / `lib/bbox-iou.ts` / `lib/pass1-route-merger.ts` / `lib/prompts/render-pass1-route.ts`

**Pass 2 改造**(PR #14,6 commits):
- Pass 2 从 1-shot 改为按 visual_category 分组并行 image_gen,每路传 `image_urls = [原图, ...crops]` 多参考图
- crop 由 `lib/bbox-crop.ts`(sharp.extract + clamp)按当前 element bbox 从原图实时切出
- prompt 用编号引用「参考图 #2 是 X」(PoC #1 通过验证不会触发 regenerate)
- **问题 #4 拖框生效路径**:用户拖 bbox → crop 改 → 参考图改 → 模型按新 crop 复刻
- callImageGen 接口扩展 `reference_image_base64s?: string[]`(向后兼容)
- 单路 image_gen 失败 → 该路 elements 标 status=failed,其他路正常

**UI 改造**(PR #15,8 commits):
- Element Review 列表加 6 类彩色 `VisualCategoryBadge` + 顶部 6 checkbox 多选筛选(默认全选)
- 详情面板加 visual_category select(6 选项,改后 onUpdate 持久化)
- canvas 顶部加横幅:「拖动框 = 调整位置坐标(进 layout.json)且作为 Pass 2 参考图裁剪边界。改 description / 类别 / 拆合并需要重跑 Pass 2 才生效。」
- 新增 `PipelineProgress` 组件(三态:全完成 N/N / 部分失败 X failed / running 显进度)
- `GET /api/pipeline-runs/[id]?include_sub=true` 返回 `{ run, sub_runs }`
- React 组件测试基建新装(`@testing-library/react` / `jest-dom` / `user-event` / `jsdom`)

**列表缩略图**(PR #16,8 commits):
- ProjectCard / PageCard 显示 256px 缩略图,加载失败 onError 回退 lucide icon
- 上传 canonical state 时 `maybeGenerateThumbnailForPage` hook 同步 sharp 缩到 `data/thumbs/{page-id}.png`
- `GET /api/thumbs/[id]` 静态文件 route + path-traversal 防御 + cache header
- 列表 API 注入 `thumbnail_url` / `sample_thumbnail_url`,**不外暴**磁盘 `thumbnail_path`
- 已有 page 显 icon fallback,**不做 lazy-generate**(避免列表 API 阻塞)

### PoC

`poc/v12-multi-route/`(PR #12):
- PoC #1 多参考图行为:**通过**(B 路完胜 A,模型按 crop 复刻无 regenerate)
- PoC #2 三轮迭代:v1 EXHAUSTIVE 77% / v2 加 DO NOT return others 退化 69% / **v3 over-include + CATEGORY_EXAMPLES 92%** ✅
- 关键洞察:删 EXCLUSIVE 限制 + 中文具体物名锚定(decoration 类显式 mention「购买后自动领取」「完单可收藏潮玩」等小文字标签)
- 完整报告: `poc/v12-multi-route/REPORT.md`

### Changed

- spec(`docs/superpowers/specs/2026-05-14-pass-multi-route-design.md`)+ plan(`docs/superpowers/plans/2026-05-14-pass-multi-route-implementation.md`)落仓
- SPEC.md(Element schema / Pass 1+2 prompt 模板 / PipelinePassKind / 缩略图生成节)
- CLAUDE.md(§4 visual_category 是正交维度,新增 §8 Pass 1 5 路并行规则 + over-include 措辞反例清单)
- PRD.md(Use Case Element Review + 列表缩略图)

### Cost / Latency 影响

| 项 | v0.1.x | v0.2(估算) | 倍数 |
|---|---|---|---|
| Pass 1 单页 | 1× mllm ≈ \$0.03 | 5× mllm ≈ \$0.15 | 5× |
| Pass 2 单页 | 1× image_gen ≈ \$0.17 | N× image_gen ≈ \$0.51-0.85(N=2-5) | 3-5× |
| Pass 1 时延 | 单次 ≈ 30-60s | 单次(并行) | 不变 |
| Pass 2 时延 | 单次 60-220s+ | 单次(并行) | 不变 |
| 单页总成本 | \~\$0.20 | \~\$0.66-1.00 | 3-5× |

### Test

169 vitest tests(原 88 + 81 新增,12 个旧 mergeElements 单测删除因被 mergeWithExisting 替代)。React 组件测试基建新建。

### dogfood round 4(PR #17)

嘉锟实测 v0.2 / 0.1.1 后反馈的 4 处「乍看不影响功能,但持续干扰」的 UX 问题修复。

- **缩略图清晰度 + 卡片占比**:`thumbnails.ts` 最长边 256 → 512(retina 1:1 显示);ProjectCard / PageCard `aspect-square` → `aspect-[4/3]`,`object-cover` → `object-contain`(设计稿不是照片,裁切反而损失信息)
- **创建后跳转**:新建项目 → `/projects/{id}`、新建页面 → `/projects/{pid}/pages/{id}`,不再停在列表
- **Pipeline stepper 加当前步骤 hint 行**:`PipelineStepper` 内部按 6 步状态推断「正在做什么 / 大概多久 / 完成后下一步」一行文案,running/info/success/failed 4 种 tone 配色
- **术语「状态图」→「设计稿」**:UI 文案全替换(dialogs / cards / empty states / toasts)。`State` 类型 / `/api/states/*` 路径 / `data/states/` 目录**不动**(技术契约)。Export spec.md 里 `## 状态: canonical` / `## 跨状态变化` 的 markdown 也不动(coding agent 消费契约)。CLAUDE.md 顶部加术语映射表

## [0.1.1] — 2026-05-14 · UX 打磨

v0.1.0 后嘉锟实测 + opus subagent 全流程 dogfood 暴露的 18+ 处 UX 卡点修复。无新能力,纯打磨。一并补 v0.1.0 commit message 描述但实际 diff 漏修的 settings layout pb-24。

### Fixed

**布局 / 滚动**(用户反馈「右侧页面无法滚动到最底部」):
- 所有 overflow / 主内容容器统一加 `pb-24`,避免内容贴 viewport 底,StickySaveBar 出现时不再遮挡底部按钮 — 涵盖 `/projects` / 项目详情 / page detail / Element Review fallback / Asset Review / Export / Settings layout
- Dialog overlay `bg-black/10` → `bg-black/50`,移除 backdrop-blur 以提高对比;DialogContent 加 `max-h-[calc(100vh-4rem)]` + 自身 `overflow-y-auto` + `shadow-2xl`

**信息层级 / 一致性**(用户反馈「全空,根本没有 btn」):
- `/projects`、`/projects/[pid]`、page detail 三处空状态统一加顶部 H1 + 右上「+ 新建 X」按钮(此前空状态只渲染居中 EmptyState,用户初次打开看不到入口)
- page detail 二级 breadcrumb 删除(已和 H1「页面名」+ 项目级 layout breadcrumb 重复 3 处)
- page detail 「上传状态图」按钮始终在状态图区右上(此前 states.length=0 时按钮藏在 EmptyState 内)

**Pipeline 进度 stepper**:
- stepper 步骤改为 Link(状态允许时):step 2 → `/elements`、step 4/5 → `/assets`、step 6 → `/export`,hover 加背景 + cursor pointer + title hint
- page detail 顶部右上原本的「Element Review / Asset Review / Export」3 个跳转按钮删除(stepper 已承担入口职责)
- stepper 下加「提示:点击已点亮的步骤可直接跳转」

**Element Review canvas**(用户反馈截图标签互相覆盖):
- 默认 `showLabels=false`(toolbar 全显示开关保留),只在选中 / hover 元素时浮现该元素标签
- 标签加蓝/橙底色框 + 白字提高可读性
- hover 元素 stroke-width 加粗(2 → 3)给视觉反馈

**中文化**(用户反馈「我去哪配置 gemini-3.1-pro 和 gpt-image-2 的 api」):
- Settings 模型分组标题:「**多模态理解模型** *Multimodal LLM*」/「**生图模型** *Image Generation*」(中文主 + 英文副便于对应 API 文档)
- Provider 卡片字段标签全中文化:名称 / API 格式 / Base URL / 模型 ID / 默认温度 / 默认最大 token / 支持视觉输入 / 接口类型 / 异步模式 / 默认画质 / Bucket / 区域 / 公网 URL 前缀
- 「Active」chip → 「使用中」
- 「Test Connection」按钮 → 「Test Connection 测试连通」
- Pass 2 confirm dialog 描述:「会调用 image_gen provider」→「会调用生图模型(默认 apimart gpt-image-2-official)」

**已修补但 v0.1.0 commit message 误声明已修的**:
- `src/app/settings/layout.tsx` 主滚动区 `pb-24`(commit `4ded220`,opus QA verify 发现 round 3 commit message 与 diff 不符)

### Verification

opus subagent 跑 12 项 verify(`qa-screenshots/verify-*.png`)11 项一次通过,1 项发现 commit message vs diff 不符并补修。

## [0.1.0] — 2026-05-14 · MVP-α

第一个完整可用版本。Phase 0-7 全部完结,端到端跑通 PoC 真实页(Pass 1 119s · Pass 2 221s · 14 asset · spec.md 质量极高)。

### Added

**核心 pipeline**(PoC v11 锁定架构):
- Pass 1 布局分析(sankuai gemini-3.1-pro-preview):多模态 LLM 识别页面元素,二分类 `static` / `code`,产 bbox + name + description + 跨状态对齐(同 entity_name)
- Pass 2 资产提取(apimart gpt-image-2-official):image-edit 输出绿幕 `#00FF00` 背景 PNG,async submit/poll/download 模式
- 本地 chroma green key(0 API):`g_excess = G - max(R, B)` 阈值 25/60 + spill suppression,中文白色 / 浅色 / 半透质感全部保留
- scipy port 切片(`binary_dilation` + connected component,gap=15 + min_opaque_pct=1%):移植 `ref/split_elements.py` 到纯 TS

**UI**:
- Sidebar + 顶层 layout(中文 only,无 i18n)
- Settings:Multimodal LLM / ImageGen / CDN provider CRUD,api_key 双向 mask(`sk-***xxxx`),Test Connection(ping 5-token / 16x16 单像素 / HeadBucket),首启动 seed 4 个 default provider
- Project / Page / State CRUD + multipart 多文件上传 + 缩略图
- Pipeline stepper 6 步可视化(布局 / Element Review / Pass 2 / Asset Review / CDN / Export),状态绿/蓝/红/灰
- Element Review canvas:bbox 拖拽 + 空白拉新 + resize handle + 叠加层 toggle + 跨状态对齐 chip + 详情面板编辑(static/code 切换字段)
- Asset Review:batch PNG 预览(透明棋盘格)+ 14 切片 grid + 详情面板(单元素重抠 / 上传 CDN)
- Export 页面:树形预览 + Open folder(macOS `open`)+ Download zip(streaming)
- Pass 1/2 失败 retry 按钮 + Test Connection dirty 提示

**API**(17 routes):
- Provider:GET/PUT `/api/config` + POST `/api/config/test`(按 kind 分发)
- 实体 CRUD:Project / Page / State / Element / Asset
- Pipeline:POST `/api/states/[id]/pass1` / `/api/states/[id]/pass2` / `/api/elements/[id]/re-extract`
- 二进制:GET `/api/states/[id]/raw` / `/api/states/[id]/keyed` / `/api/states/[id]/pass2-raw` / `/api/assets/[id]/raw`
- CDN:POST `/api/assets/[id]/upload` / `/api/pages/[id]/upload-all-assets`
- Export:POST `/api/pages/[id]/export` (folder / zip)
- 系统:POST `/api/system/open-folder` (macOS only)

**数据格式**(SPEC.md § 文件系统布局):
- AppConfig / Project / Page / State / Element / Asset / PipelineRun JSON schema
- `data/{config,projects,pages,states,elements,assets,pipelines,raw,pass2,keyed,assets-bin}` 持久化
- `writeAtomic`(tmp + rename)+ 内存 run lock(`state:{id}` 互斥)

**Export 文件结构**(SPEC.md § Export):
- `config.json` / `pages/{slug}/meta.json` / `states/{slug}.json`(bbox 反归一化补 `bbox_pixels`)
- `assets/manifest.json`(`cdn_url` 为 null 时 fallback 本地)
- `spec.md`(整体描述 + 元素表 + 布局 + Code 元素 spec + Coding agent 指令)
- `raw/original-{state}.png` + `raw/extracted.png`

**测试覆盖**:88 unit(vitest)+ 8 e2e smoke(Playwright)
- `fs-utils` / `id` / `mask` / `cdn-client`(用 aws-sdk-client-mock)/ `exporter`(spec.md inline snapshot)/ `pass1-runner.mergeElements`(bbox 归一化 12 case)
- E2E:页面渲染 6 项 + CRUD 烟测 2 项,不依赖真 LLM key

**文档**:PRD / SPEC / CLAUDE / AGENTS / PLAN + 7 个 phase 子 plan + README quickstart + PoC v1-v11 完整探索史

### Fixed

- **Pass 1 bbox 像素坐标兜底归一化**(2026-05-14 dogfood 暴露):gemini-3.1-pro-preview 偶尔无视 prompt 里「NORMALIZED 0-1」直接输出像素 `[20,14,514,24]`,老代码 `clamp01` 把 bbox 全夹成 `[1,1,1,1]` 不可用 → 检测同批任一分量 > 1.5 视为像素,按 `state.width/height` 整批归一化后再 clamp01
- **Pass 1 max_tokens 12000 → 32000**:gemini thinking_config 占 4k + 中文 30+ 元素 JSON 在 5675 char 处截断 → 提高 default seed,留 buffer

### Architecture decisions(被推翻的尝试,反面教材)

PoC v1-v11 11 轮迭代锁定:
- ❌ Pass 2 transparent prompt → 触发 model regenerate(漏画 + 字形漂)
- ❌ Pass 2 白底 + white-threshold 抠图 → 抠穿元素内部白色(chip 白底 / 娃娃白发),**结构性死路**
- ❌ koukoutu / rmbg / SAM 分割模型 → chip 白底误抠,且 chroma green 0 API 已够用
- ❌ Pass 2 prompt 加 entity_name / bbox / JSON 字段名 → 触发模型自由发挥
- ❌ MVP 引入第三类 `hybrid` / `mixed-static-container` → LLM 二分类已能吸收歧义
- ❌ Pass 1 输出 polygon outline → bbox 已够 image-edit 用,polygon 是 review UX 而非功能

详见 [poc/EXPLORATION-HISTORY.md](./poc/EXPLORATION-HISTORY.md) 与 [CLAUDE.md § 反直觉强约束](./CLAUDE.md)。

### Stack

- Next.js 16.2.6(App Router + Route Handlers + proxy.ts CSRF gate via `Sec-Fetch-Site`)
- React 19.2 / TypeScript 6(strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`)
- shadcn v4 (style: base-nova) / Tailwind v4 / sonner / lucide-react / nanoid / sharp(图像处理)
- @aws-sdk/client-s3(CDN)/ archiver@7(zip 流式)/ openai SDK(image gen 备选)
- vitest 4.1 + Playwright 1.60

### Cost(MVP-α 实测,canonical 单状态 ~14 元素)

- Pass 1(sankuai gemini)~$0.02 / 119s
- Pass 2(apimart gpt-image-2-official quality=high)~$0.17 / 221s
- 抠图 + 切片:0 API,~1s
- 总计 **~$0.19/页 + ~6min**

[Unreleased]: https://github.com/kuen54/img2UI/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/kuen54/img2UI/releases/tag/v0.1.1
[0.1.0]: https://github.com/kuen54/img2UI/releases/tag/v0.1.0
