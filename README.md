# img2UI

把 AI 生图设计稿(GPT-image-2 等输出的栅格化 PNG)转成 coding agent(Claude Code / Cursor 等)可消费的素材包 — 透明 PNG + layout JSON + `spec.md` 主入口。

本地 web app,Next.js 16 + 文件系统 JSON,无独立后端。架构 PoC v11 锁定:**Pass 1 (gemini-3.1-pro)** → 用户 Element Review → **Pass 2 (gpt-image-2-official 绿幕 `#00FF00`)** → **本地 chroma green key** → **scipy 切片** → Asset Review → CDN 上传 → Export。

---

## 30 分钟跑通第一个页面

### 1. 装依赖

```bash
git clone https://github.com/kuen54/img2UI.git
cd img2UI
npm install
npm run dev
# 浏览器开 http://localhost:3000(端口被占时自动用 3001)
```

需要 Node.js 22+(实测 v25 可用),npm 10+。

### 2. 配两个 API key

打开 `http://localhost:3000/settings/models`。已 seed 好 4 个 provider,active 的两个就是要用的:

| 用途 | provider | key 申请 |
|---|---|---|
| **Pass 1**(布局分析) | `sankuai Gemini 3.1 Pro` | 美团 sankuai gateway 内部分配(`https://aigc.sankuai.com`) |
| **Pass 2**(资产提取) | `apimart gpt-image-2-official` | [apimart.ai](https://docs.apimart.ai/cn/api-reference/images/gpt-image-2/official) ~$0.17/页 |

填 API key → 点底部「保存」 → 点每张卡的「Test Connection」 → 看 toast 报「✓ 4.0s」类似就通了。

> ⚠ **Test Connection 在有未保存改动时 disabled** — 必须先点「保存」。

可选:`/settings/cdn` 配 S3 兼容 CDN(选填,不配也能 Export,manifest.json 中 cdn_url 写为 null,coding agent 会 fallback 本地路径)。

### 3. 跑第一张图

1. **新建项目** `/projects` → 「新建项目」(填名字 + 描述 + 技术栈 hint)
2. **新建页面** 项目内 → 「新建页面」(填页面名 + 路由 hint)
3. **上传 PNG** 页面详情 → 「上传状态图」 → 选 PNG → 改名(如 `canonical`)→ 设为 canonical
4. **Pass 1 自动跑** ~2 分钟,产出 15-30 个元素(代表布局)
5. **Element Review** stepper → 「Element Review」按钮 → bbox 拖拽 + 改 type(static/code)+ 改 description
6. **Pass 2 提取** Asset Review 顶部 → 「Run Pass 2」 → ~3 分钟(用真实 image-edit + 本地 chroma key + scipy 切片)
7. **Asset Review** 看 14 张切片 + chroma key 后 batch PNG → 失败的可单元素重抠
8. **(可选)上传 CDN** 「批量上传 CDN」按钮(没 CDN 跳过)
9. **Export** Pipeline stepper 第 6 步 → 输入 `~/img2ui-out` → 「Export 到文件夹」 → 看 `~/img2ui-out/{项目}/pages/{页面}/spec.md`
10. **喂给 Claude Code** `cd ~/img2ui-out/{项目}` 后跟 Claude 说「读 pages/{页面}/spec.md 实现这个页面」

---

## 文档导航

| 我想了解... | 看这里 |
|---|---|
| 产品定位 / 用户场景 / 决策 | [PRD.md](./PRD.md) |
| 数据 schema / API 契约 / Pass 1+2 prompt 模板 / 文件结构 / 错误重试 | [SPEC.md](./SPEC.md) |
| **反直觉强约束**(每次进项目必读) | [CLAUDE.md](./CLAUDE.md) |
| 开发流程 / 分支 / PR / commit / AI 协议 | [AGENTS.md](./AGENTS.md) |
| 实施 plan(7 phases) | [PLAN.md](./PLAN.md) |
| 当前 phase 子 plan | [docs/plans/](./docs/plans/) |
| PoC 历史(v1-v11 完整记录,反面教材集) | [poc/EXPLORATION-HISTORY.md](./poc/EXPLORATION-HISTORY.md) |

---

## 当前阶段

**Phase 7:dogfood + 打磨**(进行中)

- ✅ Phase 0:PoC v11 锁定(2026-05-13)
- ✅ Phase 1:Next.js 16 + shadcn v4 + 基础库 + Sidebar
- ✅ Phase 2:Provider 配置 CRUD(mllm / image_gen / cdn) + 双向 mask + Test Connection
- ✅ Phase 3:Project / Page / State CRUD + 多文件上传 + Pipeline stepper
- ✅ Phase 4:真实 Pass 1 LLM 调用 + Element Review canvas(bbox 拖拽)
- ✅ Phase 5:真实 Pass 2(apimart async + 绿幕 chroma key + scipy 切片)+ Asset Review
- ✅ Phase 6:CDN 单/批上传 + Export 文件夹 + spec.md 模板 + zip 流式
- 🟡 Phase 7:dogfood 已通(PoC canonical-1024.png 端到端跑通)+ retry 按钮 + 单测覆盖 + README

详见 [PLAN.md](./PLAN.md)。

---

## 故障排查

| 现象 | 原因 | 解法 |
|---|---|---|
| Pass 1 失败 `LLM 输出非 JSON` 截断在 ~5000 char | gemini thinking 占用 + max_tokens 不够 | `/settings/models` 把 sankuai `Default max tokens` 改 32000(默认 seed 已 32000,旧 provider 配置需手动改) |
| Element Review canvas bbox 全在左上角小框内 | LLM 偶尔输出像素坐标(非归一化) | 已自动兜底 — 重跑 Pass 1 即可。如果仍异常看 `data/pipelines/run_*.json` |
| Pass 2 后切片只有 1-2 个,绿幕 PNG 看起来正常 | chroma key 阈值或元素互相紧贴 | Asset Review 看 keyed PNG;v1 暂无 slider,可改 `lib/alpha-key.ts` 的 `g_excess > 60` 阈值 |
| `manifest.json` 中 `cdn_url: null` | 没配 active CDN 或没批量上传 | coding agent 自动 fallback 本地 `assets/{id}.png`,无需修 |
| 端口 3000 被占用 | 其他 next 实例 | next 自动切 3001;或 `lsof -ti:3000 \| xargs kill` |

更详细的失败模式 + 反面教材 → [CLAUDE.md § 反直觉强约束](./CLAUDE.md) + [poc/EXPLORATION-HISTORY.md](./poc/EXPLORATION-HISTORY.md)。

---

## 开发命令

```bash
npm run typecheck   # tsc --noEmit
npm test            # vitest run(88 unit tests)
npm run lint        # eslint
npm run build       # next build(含 typecheck)
```

PR 前必跑五件套(包括 build)。详见 [AGENTS.md § 7](./AGENTS.md)。

---

## 数据存放(运行时,gitignored)

| 路径 | 内容 |
|---|---|
| `data/config.json` | AppConfig — providers + prompts + settings |
| `data/projects/{id}.json` · `data/pages/{id}.json` · `data/states/{id}.json` | 实体 |
| `data/elements/{page-id}.json` | 整页 Element[](原子写整批替换) |
| `data/assets/{id}.json` · `data/assets-bin/{id}.png` | Asset metadata + 切片 PNG |
| `data/raw/{state-id}.png` | 用户上传的原图 |
| `data/pass2/{state-id}.png` | Pass 2 输出的绿幕 PNG(留底,debug 用) |
| `data/keyed/{state-id}.png` | chroma key 后的透明 PNG(切片输入) |
| `data/pipelines/{run-id}.json` | PipelineRun 记录(error 字段含失败堆栈) |

---

## 仓库

[github.com/kuen54/img2UI](https://github.com/kuen54/img2UI)(private)
