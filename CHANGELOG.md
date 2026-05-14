# Changelog

All notable changes to img2UI are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), version numbers are loose milestones (no semver — no external consumers).

## [Unreleased]

(empty)

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
