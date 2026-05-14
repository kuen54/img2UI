# Changelog

All notable changes to img2UI are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), version numbers are loose milestones (no semver — no external consumers).

## [Unreleased]

(empty)

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

[Unreleased]: https://github.com/kuen54/img2UI/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/kuen54/img2UI/releases/tag/v0.1.0
