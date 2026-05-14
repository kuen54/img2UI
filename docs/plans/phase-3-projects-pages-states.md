# Phase 3:Project / Page / State CRUD + 文件上传(子 plan)

> **状态**:🔴 未开始
> **目标**:能创建项目 → 新建页面 → 上传 N 张状态图 → 自动触发 mock Pass 1 → Pipeline 进度区显示状态
> **退出**:端到端流程跑通,所有数据持久化在 `data/` 下;reload 浏览器状态恢复;`tsc --noEmit && npm test && npm run lint && npm run build` 全过
> **预估**:3-4 天
> **配套文档**:[PLAN.md](../../PLAN.md) Phase 3 / [SPEC.md § API 契约](../../SPEC.md#api-契约) / [PRD.md § Use Case 2](../../PRD.md)

---

## 分支与 commit 节奏

- **分支**:`feat/phase-3-projects-pages-states`(单 PR 多 commit)
- **commit**:每 Task 1-2 个 commit,scope 用 `feat(api)` / `feat(ui)` / `feat(lib)` / `feat(pipeline)` 等

---

## Phase 1+2 沉淀(直接复用)

| 模块 | 用途 |
|---|---|
| `src/lib/fs-utils.ts` | `writeAtomic` / `readJson` / `writeJson` / `listJsonInDir` |
| `src/lib/id.ts` | `newProjectId` / `newPageId` / `newStateId` / `newRunId` |
| `src/lib/types.ts` | `Project` / `Page` / `State` / `PipelineRun` / `Element` 类型 |
| `src/lib/run-lock.ts` | `acquireLock` / `releaseLock` 在 mock pass1 路径用 |
| `src/components/ui/confirm-dialog.tsx` | 删除项目/页面前确认 |
| `src/components/ui/empty-state.tsx` | 空状态(暂无项目 / 暂无页面) |
| `src/components/ui/sticky-save-bar.tsx` | Phase 4 才用,Phase 3 不需要(单实体编辑无 batch save 需求) |

---

## Task 3.1:实体 CRUD lib + API routes(Project / Page / State)

**目标**:三个实体的读写函数 + REST 端点。**纯文件系统操作,无 LLM 调用**

**Files**:
```
src/lib/projects.ts                         # listProjects / getProject / createProject / updateProject / deleteProject
src/lib/pages.ts                            # listPages(by project_id) / getPage / createPage / updatePage / deletePage
src/lib/states.ts                           # listStates(by page_id) / getState / saveState(metadata) / deleteState
src/lib/__tests__/{projects,pages,states}.test.ts

src/app/api/projects/route.ts               # GET, POST
src/app/api/projects/[id]/route.ts          # GET, PUT, DELETE(级联删除 pages + states)
src/app/api/projects/[id]/pages/route.ts    # GET, POST
src/app/api/pages/[id]/route.ts             # GET, PUT, DELETE(级联删除 states)
src/app/api/states/[id]/route.ts            # GET, DELETE(同时删 raw PNG)
```

- [ ] **3.1.1** `src/lib/projects.ts`(参考模式,其他两个实体类比)
  ```ts
  import path from 'node:path'
  import { promises as fs } from 'node:fs'
  import type { Project } from '@/lib/types'
  import { DATA_ROOT, listJsonInDir, readJson, writeJson } from '@/lib/fs-utils'
  import { newProjectId } from '@/lib/id'

  const DIR = path.join(DATA_ROOT, 'projects')
  const fileFor = (id: string) => path.join(DIR, `${id}.json`)

  export async function listProjects(): Promise<Project[]> {
    return listJsonInDir<Project>(DIR)
  }

  export async function getProject(id: string): Promise<Project | null> {
    return readJson<Project>(fileFor(id))
  }

  export async function createProject(input: Pick<Project, 'name' | 'description' | 'tech_stack_hint' | 'cdn_provider_id'>): Promise<Project> {
    const now = new Date().toISOString()
    const project: Project = {
      id: newProjectId(),
      name: input.name,
      ...(input.description !== undefined && { description: input.description }),
      ...(input.tech_stack_hint !== undefined && { tech_stack_hint: input.tech_stack_hint }),
      ...(input.cdn_provider_id !== undefined && { cdn_provider_id: input.cdn_provider_id }),
      created_at: now,
      updated_at: now,
    }
    await writeJson(fileFor(project.id), project)
    return project
  }

  export async function updateProject(id: string, patch: Partial<Project>): Promise<Project | null> {
    const existing = await getProject(id)
    if (!existing) return null
    const next: Project = { ...existing, ...patch, id: existing.id, updated_at: new Date().toISOString() }
    await writeJson(fileFor(id), next)
    return next
  }

  export async function deleteProject(id: string): Promise<boolean> {
    try {
      await fs.unlink(fileFor(id))
      return true
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return false
      throw e
    }
  }
  ```

  > **`exactOptionalPropertyTypes` 注意**:Phase 1 沉淀的坑——optional 字段不能直接 `description: undefined`,要条件 spread `...(value !== undefined && { description: value })`

- [ ] **3.1.2** `src/lib/pages.ts` 类比,加 `listPagesByProject(project_id)` + `deletePagesByProject(project_id)`(级联删除用)

- [ ] **3.1.3** `src/lib/states.ts` 类比,加 `listStatesByPage(page_id)` + `deleteStatesByPage(page_id)` + `deleteStateRawImage(state_id)`(删 PNG 文件)

- [ ] **3.1.4** API routes:
  - `GET /api/projects` → 200 Project[]
  - `POST /api/projects` Body Pick<Project,...> → 201 Project
  - `GET /api/projects/[id]` → 200 Project | 404
  - `PUT /api/projects/[id]` → 200 Project | 404
  - `DELETE /api/projects/[id]` → 204(级联删除 pages + states + 它们的 PNG/JSON)
  - `GET /api/projects/[id]/pages` → 200 Page[]
  - `POST /api/projects/[id]/pages` Body { name, route_hint? } → 201 Page
  - `GET /api/pages/[id]` → 200 Page | 404
  - `PUT /api/pages/[id]` → 200 Page | 404
  - `DELETE /api/pages/[id]` → 204(级联删除 states + PNG)
  - `GET /api/states/[id]` → 200 State | 404
  - `DELETE /api/states/[id]` → 204(同时删 raw PNG;**如果 state 是该 page 的 canonical_state_id,清空那个字段**)

- [ ] **3.1.5** 单测覆盖每个 lib 的 happy path + ENOENT 路径 + 级联删除路径。约 12 新单测

- [ ] **3.1.6** Commit
  ```
  feat(lib,api): Project / Page / State CRUD + REST 端点 + 级联删除
  ```

---

## Task 3.2:文件上传 — `POST /api/pages/[id]/states`

**目标**:multipart 上传 N 张 PNG,逐张读尺寸,写到 `data/raw/{state-id}.png`,创建 State 实体

**Files**:
```
src/app/api/pages/[id]/states/route.ts
src/lib/image-meta.ts                       # 用 sharp 读宽高
src/lib/__tests__/image-meta.test.ts        # 用真实 PoC PNG 测
```

- [ ] **3.2.1** `src/lib/image-meta.ts`
  ```ts
  import sharp from 'sharp'

  export async function readImageDimensions(buffer: Buffer): Promise<{ width: number; height: number }> {
    const meta = await sharp(buffer).metadata()
    if (!meta.width || !meta.height) throw new Error('图像缺失尺寸 metadata')
    return { width: meta.width, height: meta.height }
  }
  ```

- [ ] **3.2.2** `src/app/api/pages/[id]/states/route.ts`(POST)
  ```ts
  // multipart 解析:Next.js Route Handler 直接 req.formData()
  // 数据约定:
  //   files: File[]                    // PNG 二进制
  //   meta: string (JSON)              // { states: [{ filename, name, is_canonical }] }
  //
  // 逻辑:
  //   1. 读 page,确认存在
  //   2. parse meta JSON,验证 files.length === meta.states.length
  //   3. 校验 PNG magic bytes (89 50 4E 47),非 PNG 拒绝
  //   4. 对每个文件:读 dimensions,写 data/raw/{state-id}.png,写 data/states/{state-id}.json
  //   5. 如果 page.canonical_state_id 为空 + 某 state.is_canonical = true → 更新 page
  //   6. 返回 State[]
  ```

  ★ 边界 case:
  - 文件超大:Next.js 默认 body limit 是 1MB,设计稿 PNG 可能 5-15MB。在 route handler 顶部加 `export const maxDuration = 60` 和 `export const runtime = 'nodejs'`(默认就是 nodejs)。Body size 通过 `next.config.ts` 的 `experimental.serverActions.bodySizeLimit` 调到 50mb(或者用 Web Streams 直接处理)
  - 并发上传同一 page:用 `run-lock` 锁 `page:${page_id}:upload`

- [ ] **3.2.3** 单测:用 `poc/inputs/canonical-512.png` 作为 fixture,POST 一张,断言 state 文件 + raw PNG 文件创建 + dimensions 正确

- [ ] **3.2.4** Commit
  ```
  feat(api): /api/pages/[id]/states 上传 multipart + sharp 读尺寸
  ```

---

## Task 3.3:Mock Pass 1 触发(占位实现)

**目标**:`POST /api/states/[id]/pass1` 写 PipelineRun + 设状态 + 生成 mock Element[]。**Phase 4 替换为真实 LLM 调用,接口契约不变**

**Files**:
```
src/app/api/states/[id]/pass1/route.ts
src/app/api/pipeline-runs/[id]/route.ts     # 前端轮询用
src/lib/pipelines.ts                        # PipelineRun CRUD
src/lib/elements.ts                         # 整页 Element[] 整批读写
```

- [ ] **3.3.1** `src/lib/pipelines.ts`:`createRun` / `updateRun` / `getRun`,写 `data/pipelines/{run-id}.json`

- [ ] **3.3.2** `src/lib/elements.ts`:`getElementsByPage(page_id)` / `saveElementsForPage(page_id, Element[])`(整批替换写 `data/elements/{page-id}.json`)

- [ ] **3.3.3** `POST /api/states/[id]/pass1` mock 实现:
  ```ts
  // Phase 3 mock(Phase 4 替换):
  //   1. acquireLock(`state:${state_id}`)
  //   2. 创建 PipelineRun(pass='pass1', status='running')
  //   3. 设 state.pipeline_status = 'pass1_running'
  //   4. mock 处理:生成 3-5 个 mock Element(name 如「卡通娃娃」「按钮组」,bbox 随机但合理)
  //      - 如果该 page 已有 elements,合并(同 entity_name 共享 id),否则创建新的
  //   5. 写 data/elements/{page-id}.json
  //   6. 设 state.pipeline_status = 'pass1_done',state.pass1_run_id = run.id
  //   7. 更新 PipelineRun status='completed'
  //   8. releaseLock
  //   9. 返回 202 { run_id }
  ```

  > 注:Phase 3 同步执行(mock 很快),Phase 4 改成异步(立即返回 202,LLM 调用后台跑)。前端轮询逻辑两阶段一致

- [ ] **3.3.4** `GET /api/pipeline-runs/[id]` → PipelineRun(前端 2s 轮询 completed/failed 时停)

- [ ] **3.3.5** Commit
  ```
  feat(pipeline): Pass 1 mock 触发 + PipelineRun + Elements lib(Phase 4 替换 LLM 调用)
  ```

---

## Task 3.4:UI — `/projects` 项目列表 + 新建项目 dialog

**目标**:渲染项目卡片网格,空态时显示「+ 新建项目」大按钮,有项目时顶部按钮 + 网格

**Files**:
```
src/app/projects/page.tsx                   # 替换 Phase 1 / 2 的空态
src/components/projects/new-project-dialog.tsx
src/components/projects/project-card.tsx    # 单项目卡:name / description / 创建时间 / 删除按钮
src/lib/api/projects-client.ts              # 客户端 fetch 封装
```

- [ ] **3.4.1** `src/lib/api/projects-client.ts`
  ```ts
  // 客户端 fetch 封装,统一处理 error
  // listProjectsApi() / createProjectApi() / deleteProjectApi() / updateProjectApi()
  ```

- [ ] **3.4.2** `new-project-dialog.tsx`(shadcn Dialog,字段:name / description / tech_stack_hint),onCreate 回调

- [ ] **3.4.3** `project-card.tsx`(shadcn Card,Trash icon 走 useConfirm 删除)

- [ ] **3.4.4** `projects/page.tsx`('use client',`useEffect` fetch list,`useState` 维护 projects 数组)

- [ ] **3.4.5** Commit
  ```
  feat(ui): /projects 列表 + 新建项目 dialog + 删除 confirm
  ```

---

## Task 3.5:UI — 项目详情(`/projects/[pid]`)+ 新建页面

**目标**:进项目看到页面列表(空态显示「+ 新建页面」大按钮),顶部展示项目名 + 描述 + 编辑入口(Phase 3 暂不实现编辑,Phase 4 v1)

**Files**:
```
src/app/projects/[pid]/layout.tsx           # 项目级面包屑
src/app/projects/[pid]/page.tsx             # 页面列表
src/components/projects/new-page-dialog.tsx
src/components/projects/page-card.tsx       # 页面卡:name / route_hint / 状态图数 / 删除
src/lib/api/pages-client.ts                 # listPagesApi(project_id) / createPageApi / deletePageApi
```

- [ ] **3.5.1** `[pid]/layout.tsx`:面包屑「项目 / {project.name}」(用 `notFound()` 处理 404)

- [ ] **3.5.2** `[pid]/page.tsx`:加载 pages,渲染网格 / 空态。点页面卡片 → 跳到 `/projects/[pid]/pages/[id]`

- [ ] **3.5.3** Commit
  ```
  feat(ui): 项目详情 + 新建页面 + 面包屑
  ```

---

## Task 3.6:UI — 页面详情(`/projects/[pid]/pages/[id]`)+ 状态上传 + Pipeline stepper

**目标**:**Phase 3 最大的一页**。展示状态图缩略图网格,提供文件上传入口,展示 6 步 pipeline stepper

**Files**:
```
src/app/projects/[pid]/pages/[id]/page.tsx
src/components/pages/state-card.tsx         # 单状态:缩略图 + name + canonical badge + pipeline 状态 badge
src/components/pages/upload-states-dialog.tsx  # 多文件选择 + 每张填 name + 选 canonical
src/components/pages/pipeline-stepper.tsx   # 6 步进度
src/lib/api/states-client.ts                # listStatesApi / uploadStatesApi(FormData) / triggerPass1Api / pollRunApi
```

- [ ] **3.6.1** `pipeline-stepper.tsx`:6 步水平 stepper
  ```
  布局分析 → 元素 Review → 资产提取 → 资产 Review → CDN 上传 → Export
  ```
  每步根据 page 的 states / elements / assets 状态推断 icon(✓ / ⏳ / ⚪ / ✗)。Phase 3 只有第 1 步会变(Pass 1 完成)。其他步永远 ⚪

- [ ] **3.6.2** `state-card.tsx`:用 `<Image>`(Next.js 优化)显示缩略图,canonical 加金色边框 + Star badge

- [ ] **3.6.3** `upload-states-dialog.tsx`:
  - file input 选 N 张 PNG(`accept="image/png"`)
  - 选完后,每张文件一行表单:name(default = 文件名去后缀)+ is_canonical radio(单选)
  - 提交时构造 FormData 调 POST /api/pages/[id]/states
  - 上传后自动触发每个 state 的 mock Pass 1

- [ ] **3.6.4** `[id]/page.tsx`(页面详情):
  - 顶部展示 page 名 + 路由 hint + 编辑(Phase 4 v1)
  - States 区:网格 + 「+ 上传状态图」卡(空态时是大按钮,有状态时是末尾的小卡)
  - Pipeline 进度区:stepper + 当前可操作步骤的 button(Phase 3 仅展示,不接业务)

- [ ] **3.6.5** Commit
  ```
  feat(ui): 页面详情 + 状态上传 + Pipeline stepper(mock Pass 1 自动触发)
  ```

---

## Task 3.7:Sidebar 加项目快捷入口 + README + 验证 + PR

**目标**:Sidebar 在 `/projects` 上下文展开当前项目的 pages 列表(可选,YAGNI 否则跳过)

- [ ] **3.7.1** Sidebar 改造(可选):**或者跳过,Phase 4 再说**(v0.1 KISS 先,Sidebar 仅静态二级导航)

- [ ] **3.7.2** README:在「当前阶段」描述加 Phase 3 完成

- [ ] **3.7.3** 五件套:
  ```bash
  npm run typecheck
  npm test            # 期望 ≥ 39 tests pass(Phase 2 的 27 + 新增 ~12)
  npm run lint
  npm run build
  ```

- [ ] **3.7.4** 浏览器实测端到端:
  - 删 `data/projects` `data/pages` `data/states` `data/raw` `data/elements` `data/pipelines`(干净起跑)→ `npm run dev`
  - `/` redirect → `/projects` 空态显示
  - 「+ 新建项目」→ 填 name=「测试项目」、description / tech_stack_hint → 创建
  - 点项目卡 → `/projects/[pid]` 页面列表空态
  - 「+ 新建页面」→ 填 name=「抽中页」、route_hint=「/lottery/result」→ 创建
  - 点页面卡 → `/projects/[pid]/pages/[id]` 页面详情
  - 「+ 上传状态图」→ 选 `poc/inputs/canonical-512.png`、name=canonical、is_canonical=true → 上传
  - 上传完成后自动触发 mock Pass 1 → 状态卡显示 `pass1_done` badge
  - Pipeline stepper 第 1 步(布局分析)显示 ✓
  - 刷新页面 → 数据持久(项目、页面、状态都还在)
  - 删除项目 → confirm dialog → 级联删除全部子实体(检查 `data/{pages,states,elements,pipelines,raw}` 都空了)
  - DevTools console 0 errors / 0 warnings

- [ ] **3.7.5** 开 PR
  ```bash
  git push -u origin feat/phase-3-projects-pages-states
  gh pr create --title "feat: Phase 3 Project/Page/State CRUD + 文件上传 + mock Pass 1" --body "..."
  ```

---

## Phase 3 不做的事(防 scope 蔓延 / [AGENTS.md § 5])

- ❌ Project / Page **编辑**(Phase 3 只有 create + delete,inline 编辑放 Phase 4)
- ❌ Sidebar 动态项目列表 / 子菜单(YAGNI,顶部 Sidebar 保持 Phase 1 静态)
- ❌ 真实 Pass 1 LLM 调用 —— Phase 4
- ❌ Pipeline 进度区的「Run」/「Retry」按钮接业务 —— Phase 4
- ❌ Element Review canvas —— Phase 4
- ❌ 上传时缩略图预览 —— v1 优化
- ❌ 拖拽上传 —— v1
- ❌ 文件上传进度条 —— 单文件 < 50MB 一次性传,YAGNI
- ❌ 状态图编辑(rename / 重新指定 canonical)—— Phase 4 v1

---

## Phase 1+2 沉淀的实施约束(继续生效)

| 现象 | 应对 |
|---|---|
| `noUncheckedIndexedAccess` | `arr[0]!` 或 if 判 |
| `exactOptionalPropertyTypes` | 条件 spread:`...(value !== undefined && { description: value })`,**不要直接 `description: undefined`** |
| Client component 拉 `node:fs` | 任何用 `@/lib/{config,projects,pages,states,fs-utils}` 的客户端组件都会拉 fs 进 bundle —— 必须只在 'use server' 路由 / 服务端代码用,client 必须通过 fetch API |
| React 19 `react-hooks/set-state-in-effect` | 初始 fetch 用 `useEffect` 时加 `// eslint-disable-next-line` + 注释说明 |
| Next.js 16 `middleware.ts` deprecated | 已用 proxy.ts,Phase 3 无新 middleware |
| sharp + Next.js Turbopack | sharp 是 native 模块,Phase 1 已装。Phase 3 在 server route 用,client 不可 import |

---

## 风险预警

| 风险 | 触发 | 缓解 |
|---|---|---|
| Next.js Route Handler 默认 body 1MB | 上传 5-15MB 设计稿 PNG | 在 route 文件加 `export const maxDuration = 60`,在 next.config.ts 配 body size limit;实测最简方式:Web `req.formData()` 流式读取没有 1MB 硬限制 |
| 多文件上传时单个失败 | 网络 / 磁盘满 / 损坏 PNG | route 内 try-each:成功的写盘,失败的返回 errors 数组。前端展示部分成功 |
| 同 page 并发上传 | 用户狂点上传 | `run-lock` 锁 `page:${page_id}:upload` |
| 级联删除部分失败 | 文件被占用 / 权限错 | 删除是「best effort」:每条尝试,失败汇总返回。**MVP 接受**,用户重试 |
| 缩略图大图渲染慢 | N=10 张状态全屏渲染 | 用 Next.js `<Image>` 自动 lazy + thumbnail 优化(server-side resize)。Phase 3 测 N=3 不需要担心 |
| Mock Pass 1 跟 Phase 4 真实调用 race | 切换时旧 mock state 没清 | Phase 4 切换时统一删 `data/elements` 重跑 |
| 用户上传 jpg / webp 不是 png | 设计稿可能 jpg | route 校验 PNG magic bytes(`89 50 4E 47`),拒绝非 PNG。前端 `accept="image/png"` 第一道,服务端二次校验 |

---

## Files 总览

```
src/lib/
├── projects.ts                     # NEW - CRUD lib
├── pages.ts                        # NEW
├── states.ts                       # NEW
├── pipelines.ts                    # NEW - PipelineRun CRUD
├── elements.ts                     # NEW - 整页 Element[] 读写
├── image-meta.ts                   # NEW - sharp 读尺寸
└── api/
    ├── projects-client.ts          # NEW - 客户端 fetch 封装
    ├── pages-client.ts             # NEW
    └── states-client.ts            # NEW

src/app/api/
├── projects/route.ts               # NEW
├── projects/[id]/route.ts          # NEW
├── projects/[id]/pages/route.ts    # NEW
├── pages/[id]/route.ts             # NEW
├── pages/[id]/states/route.ts      # NEW(multipart 上传)
├── states/[id]/route.ts            # NEW
├── states/[id]/pass1/route.ts      # NEW(Phase 3 mock,Phase 4 真实)
└── pipeline-runs/[id]/route.ts     # NEW(前端轮询)

src/app/projects/
├── page.tsx                        # 替换 Phase 1/2 空态
├── [pid]/layout.tsx                # NEW - 面包屑
├── [pid]/page.tsx                  # NEW - 页面列表
└── [pid]/pages/[id]/page.tsx       # NEW - 页面详情

src/components/
├── projects/
│   ├── new-project-dialog.tsx      # NEW
│   ├── new-page-dialog.tsx         # NEW
│   ├── project-card.tsx            # NEW
│   └── page-card.tsx               # NEW
└── pages/
    ├── state-card.tsx              # NEW
    ├── upload-states-dialog.tsx    # NEW
    └── pipeline-stepper.tsx        # NEW
```

预计 ~30 新文件,7 commit。

---

**子 plan 版本**:v0.1 (2026-05-14)
**配套主 plan**:[PLAN.md](../../PLAN.md) Phase 3
**前置 phase**:Phase 1 ✅ + Phase 2 ✅ merged
