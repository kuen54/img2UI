# img2UI

把 AI 生图设计稿(GPT-image-2 等输出的栅格化 PNG)转成 coding agent(Claude Code / Cursor 等)可消费的素材包(透明 PNG + layout.json + spec.md)。本地 web app,Next.js + 文件系统 JSON,无独立后端。

## 文档导航

| 我想了解... | 看这里 |
|---|---|
| 项目为什么存在 / 解决什么问题 / 用户场景 | [PRD.md](./PRD.md) |
| 数据 schema / API 契约 / Pass 1+2 prompt 模板 / 文件结构 / 错误重试 | [SPEC.md](./SPEC.md) |
| 反直觉强约束(每次进项目必读) | [CLAUDE.md](./CLAUDE.md) |
| 开发流程 / 分支 / PR / commit / AI 协议 | [AGENTS.md](./AGENTS.md) |
| 实施 plan(7 phases) | [PLAN.md](./PLAN.md) |
| 当前 phase 子 plan | [docs/plans/](./docs/plans/) |
| PoC 历史(v1-v11 完整记录) | [poc/EXPLORATION-HISTORY.md](./poc/EXPLORATION-HISTORY.md) |

## 当前阶段

**Phase 4:真实 Pass 1 + Element Review**(进行中)

- ✅ Phase 0:PoC v11 锁定(2026-05-13),架构终版:Pass 1 (gemini) → Pass 2 (gpt-image-2-official, 绿幕 #00FF00) → 本地 chroma green key → scipy split_elements 切片
- ✅ Phase 1:Next.js 16 + shadcn v4 + 基础库 / Sidebar + 占位页面
- ✅ Phase 2:Provider 配置 CRUD + Settings UI(API key 双向 mask + Test Connection)
- ✅ Phase 3:Project / Page / State CRUD + 多文件上传 + Mock Pass 1 + Pipeline stepper
- 🟡 Phase 4:真实 Pass 1 LLM 调用 + Element Review canvas(bbox 拖拽 + 列表 + 详情 panel)
- ⚪ Phase 5-7:见 [PLAN.md](./PLAN.md)

## 本地运行

前提:Node.js 22+(实测 v25 可用),npm 10+

```bash
npm install
npm run dev
# 浏览器开 http://localhost:3000
```

首启动会在 `data/config.json` 写入默认 provider 模板(sankuai mllm + apimart image_gen 默认 active,OpenAI 备选),需要在 `/settings/models` 填 API key 后才能用(Phase 2 启用)。

## 开发命令

```bash
npm run typecheck   # tsc --noEmit
npm test            # vitest run
npm run lint        # eslint
npm run build       # next build (含 typecheck)
```

PR 前请跑完上面四个,缺一不可([AGENTS.md § 7])。

## 数据存放(运行时,gitignored)

| 路径 | 内容 |
|---|---|
| `data/config.json` | 全局 AppConfig(providers + prompts + settings) |
| `data/projects/{id}.json` | Project 实体 |
| `data/pages/{id}.json` | Page 实体 |
| `data/states/{id}.json` | State 实体 |
| `data/elements/{page-id}.json` | 整页 Element[](原子写整批替换) |
| `data/assets/{id}.json` | Asset metadata |
| `data/raw/{state-id}.png` | 用户上传的原图 |
| `data/pass2/{state-id}.png` | Pass 2 输出的绿幕 PNG(留底) |
| `data/keyed/{state-id}.png` | chroma key 后的透明 PNG(切片输入) |
| `data/assets-bin/{asset-id}.png` | 切片后的单 asset PNG |
| `data/pipelines/{run-id}.json` | PipelineRun 记录(debug 用) |

## 仓库

[github.com/kuen54/img2UI](https://github.com/kuen54/img2UI)(private)
