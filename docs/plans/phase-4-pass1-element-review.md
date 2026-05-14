# Phase 4:真实 Pass 1 + Element Review canvas(子 plan)

> **状态**:🔴 未开始
> **目标**:Phase 3 mock Pass 1 替换为真实 mllm 调用;新增 Element Review 页面(Canvas + 列表 + 详情 panel),用户能看到 / 编辑 / 新增 / 删除元素并保存
> **退出**:配 sankuai key 后跑真实 Pass 1 出 ~10+ 元素;Element Review 能拖 bbox / 改字段 / 整批保存;reload 后改动持久
> **预估**:5-7 天(Phase 4 是 Phase 4-5 中最大 UI 任务,Canvas 拖拽+多状态对齐都在这)
> **配套文档**:[PLAN.md](../../PLAN.md) Phase 4 / [SPEC.md § Pass 1 prompt 模板](../../SPEC.md) / [SPEC.md § API 契约 § Element / Asset](../../SPEC.md) / [PRD.md § Use Case 3](../../PRD.md)

---

## 分支与 commit 节奏

- **分支**:`feat/phase-4-pass1-element-review`(单 PR 多 commit)
- **commit**:每 Task 1-2 个,scope `feat(api)` / `feat(pipeline)` / `feat(ui)`

---

## Phase 1-3 沉淀(直接复用)

| 模块 | 用途 |
|---|---|
| `src/lib/llm-client.ts` | Phase 2 的 ping 框架,Phase 4 加 `callMllm()` 完整请求 |
| `src/lib/config.ts` | `loadConfig()` 拿 active mllm provider |
| `src/lib/seeds/default-prompts.ts` | `DEFAULT_PASS1_LAYOUT` 系统消息 |
| `src/lib/elements.ts` | `getElementsByPage` / `saveElementsForPage`(Phase 3 已有) |
| `src/lib/pipelines.ts` | `createRun` / `completeRun` / `failRun` |
| `src/lib/run-lock.ts` | 同 state pipeline 互斥 |
| `src/lib/states.ts` | `setPipelineStatus` |
| `src/components/ui/sticky-save-bar.tsx` | Element Review 整批保存 |
| `src/components/ui/confirm-dialog.tsx` | 删除元素确认 |

---

## Task 4.1:真实 Pass 1 LLM 调用(替换 mock)

**目标**:`POST /api/states/[id]/pass1` 真实调用 active mllm provider(sankuai gemini / openai / anthropic),解析 JSON 写 Elements。**接口契约不变**(202 + run_id + 同步执行直到完成)

**Files**:
```
src/lib/llm-client.ts             # 扩展:callMllm 完整请求(非只 ping)
src/lib/pass1-runner.ts           # NEW - Pass 1 编排逻辑(读图 + 渲染 prompt + 调 LLM + 解析 + 合并写盘)
src/app/api/states/[id]/pass1/route.ts  # 重写:用 pass1-runner 替换 mock
src/lib/__tests__/pass1-runner.test.ts  # mock fetch 测端到端
```

- [ ] **4.1.1** `llm-client.ts` 加 `callMllm`:
  ```ts
  // Phase 2 ping 用最简 5-token messages,Phase 4 接收完整 messages array + 返回 content
  export async function callMllm(provider, opts: {
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string | Array<{ type: 'text' | 'image_url'; ... }> }>
    max_tokens?: number
    temperature?: number
    response_format?: { type: 'json_object' }
    extra_body?: Record<string, unknown>  // gemini 的 thinking_config 等透传
    signal?: AbortSignal
  }): Promise<{ content: string; usage?: object }>
  ```
  - 三种 api_format 分发:openai/sankuai → `/chat/completions`,anthropic → `/messages`(content 提取自 message.content[0].text)
  - 30s timeout 改成 120s(Phase 1 沉淀:Pass 1 可能需 ~50s)
  - 错误抛 Error 含 status + body 摘要

- [ ] **4.1.2** `pass1-runner.ts`(主编排)
  ```ts
  export async function runPass1(stateId: string): Promise<{ run_id: string }> {
    // 1. acquireLock(state:${stateId})
    // 2. loadConfig() → 取 active mllm provider(没有则 fail)
    // 3. getState + getPage(state.page_id):读 page metadata
    // 4. 读 raw PNG → toBase64
    // 5. 渲染 user message(SPEC § Pass 1 user message 模板)
    //    - 含 page name / page description / tech_stack_hint / state list with images
    //    - canonical 状态 first
    // 6. 创建 PipelineRun(running)+ setPipelineStatus pass1_running
    // 7. callMllm({ system: prompts.pass1_layout, user: <messages> })
    // 8. 解析 JSON(strict,失败 → failRun + pass1_failed,error.retryable=true)
    // 9. 合并已有 Elements(cross-state by entity_name)+ saveElements
    // 10. setPipelineStatus pass1_done + completeRun
    // 11. releaseLock
    // 12. 返回 { run_id }
  }
  ```

- [ ] **4.1.3** 单测:用 vi.stubGlobal('fetch', ...) mock LLM 返回 + sharp / fs mock,跑 runPass1 端到端 → 检查写出的 elements / state status / run status。覆盖:
  - happy path
  - LLM 返回非 JSON → pass1_failed
  - 没有 active mllm provider → 立即 fail
  - cross-state alignment(同 entity_name 共享 element id)

- [ ] **4.1.4** 路由 `route.ts` 重写:从 mock 改成 `await runPass1(stateId)` 直接返回结果。**保留 202 状态码语义**(同步实现也 OK,前端轮询 pipeline-runs 仍可用)

- [ ] **4.1.5** Commit
  ```
  feat(pipeline): 真实 Pass 1 LLM 调用(替换 Phase 3 mock)
  ```

---

## Task 4.2:`PUT /api/pages/[id]/elements` 整批替换 + 单元素 patch

**目标**:Element Review 改完点保存 → 前端发整 Element[] → 服务端整文件覆写

**Files**:
```
src/app/api/pages/[id]/elements/route.ts    # GET 拿当前 + PUT 整批替换
```

- [ ] **4.2.1** 路由实现:
  ```ts
  // GET 返回 Element[] from data/elements/{page_id}.json
  // PUT 接收 Element[],原子写整文件覆盖
  //   - 校验:每个元素必有 id / name / type / bbox / state_ids
  //   - bbox 4 元素 ∈ [0, 1]
  //   - type ∈ ['static', 'code']
  //   - 校验失败 → 400 列出哪些元素哪些字段错
  ```

- [ ] **4.2.2** Commit
  ```
  feat(api): /api/pages/[id]/elements GET + PUT 整批替换
  ```

---

## Task 4.3:Element Review canvas(最大组件)

**目标**:左侧主区显示原图 + 元素 bbox 描边 + 拖拽改尺寸/位置 + 空白拉新元素

**Files**:
```
src/components/element-review/canvas.tsx          # NEW 主 Canvas
src/components/element-review/canvas-toolbar.tsx  # NEW 顶部 toolbar
```

- [ ] **4.3.1** `canvas.tsx` 设计:
  - 用 `<svg>` 叠在 `<img>` 之上,坐标系是图像像素(non-normalized,内部转换 normalized ↔ pixel)
  - props:`elements: Element[]`、`selectedId: string | null`、`onSelect`、`onChange`(整批 next)、`stateImageSrc: string`、`stateImageDims: { width, height }`
  - render 流程:
    1. `<img src={stateImageSrc}>` 撑满父容器 + `object-fit: contain`
    2. `<svg viewBox="0 0 width height">` 同尺寸叠加(absolute inset-0)
    3. 每个 element 一个 `<rect>` + 角上 4 个 `<circle>` resize handle + 顶部 `<text>` 名字 chip
    4. 颜色:`type=static` 蓝(stroke-blue-500)、`type=code` 橙(stroke-orange-500),selected 加粗 + 加阴影
- [ ] **4.3.2** 交互:
  - **点击 bbox** → onSelect
  - **拖拽 bbox 主体**:onMouseDown 在 rect 上 → 进入「move」模式,onMouseMove 整体平移 bbox,onMouseUp 提交 onChange
  - **拖拽角点 4 个 handle** → 进入「resize」模式,改对应角的坐标
  - **拖拽中限制**:bbox 不能出图像边界,min size 10×10 像素
  - **空白拖拽**:onMouseDown 在没有 element 的区域 → 进入「create」模式,实时 preview 红色虚线 rect,onMouseUp 弹「新元素表单」(name+type 二选一,描述可后填)
- [ ] **4.3.3** `canvas-toolbar.tsx`:`Outlines toggle` / `Labels toggle` / `Filter (all/static/code)` / `Opacity slider`(canvas 上方一行)
- [ ] **4.3.4** Commit
  ```
  feat(ui): Element Review canvas — bbox 拖拽 + 空白拉新 + toolbar
  ```

---

## Task 4.4:Element 列表 + 详情 panel

**目标**:右侧 virtualized 列表 + 底部选中元素详情面板(可编辑全部字段)

**Files**:
```
src/components/element-review/element-list.tsx
src/components/element-review/element-detail-panel.tsx
```

- [ ] **4.4.1** `element-list.tsx`:
  - 顶部 tab(All / Static / Code / Unreviewed)
  - 每行:`reviewed` checkbox + name + type badge + cross-state chip(显示 state_ids 数量)
  - 点 row → onSelect
  - 列表底 「+ Add element manually」按钮(创建空元素,触发 canvas 进入 create 模式提示)

- [ ] **4.4.2** `element-detail-panel.tsx`:
  - 字段(按 type 切换显示):
    - `name`(input)
    - `type`(radio: static / code)
    - `description`(textarea, 80 字限制 + 计数,**type=static 时下方显示「这段描述会进 Pass 2 prompt」**)
    - type=code:`shape_spec`(textarea)+ `material_spec`(textarea)
    - `cross_state_notes`(textarea, 可选)
    - `bbox`(显示当前归一化值,只读;改要去 canvas 拖)
    - `state_ids`(列出该元素出现的 state name + checkbox 增删)

- [ ] **4.4.3** 删除按钮:Trash icon + useConfirm

- [ ] **4.4.4** Commit
  ```
  feat(ui): Element 列表 + 详情 panel(按 type 切换字段)
  ```

---

## Task 4.5:Element Review 页面 + 整批保存 + 跳转 Pass 2 入口

**目标**:`/projects/[pid]/pages/[id]/elements` 整合 Canvas + 列表 + Panel,带 StickySaveBar

**Files**:
```
src/app/projects/[pid]/pages/[id]/elements/page.tsx    # NEW 主页面
src/lib/api/elements-client.ts                         # NEW client fetch 封装
```

- [ ] **4.5.1** 页面布局:
  ```
  ┌─────────────────────────────────────────────────┐
  │ 面包屑(项目 / 页面名 / Element Review)+ state 切换  │
  ├──────────────────────────────────┬──────────────┤
  │                                  │              │
  │  Canvas (3/4 宽度)                │  Element 列表 │
  │  ├ Toolbar                       │  (1/4 宽度)   │
  │  └ <img> + <svg>                 │              │
  │                                  │              │
  ├──────────────────────────────────┴──────────────┤
  │ 选中元素详情 panel(occupies 底 1/3,折叠按钮)        │
  ├─────────────────────────────────────────────────┤
  │ StickySaveBar(改了才显示)                        │
  └─────────────────────────────────────────────────┘
  ```
- [ ] **4.5.2** state 切换逻辑:多个 state 时顶部下拉切换,canvas 显示对应 state 的图;但 `elements` 共享(整页一份),仅 `state_ids` 决定该元素是否在当前 state 显示
- [ ] **4.5.3** 整批保存:`useState<Element[]>` 维护 draft,跟 `saved` 对比 dirty,save 调 PUT /api/pages/[id]/elements
- [ ] **4.5.4** 「Run Pass 2」按钮(底部右 / Phase 5 接业务):Phase 4 暂不实现,显示 Tooltip「等所有元素都 reviewed 后 enable」
- [ ] **4.5.5** Commit
  ```
  feat(ui): Element Review 页面 + 整批保存 + state 切换
  ```

---

## Task 4.6:Page detail 页面加 Element Review 入口 + 退出验证 + PR

- [ ] **4.6.1** 改 `src/app/projects/[pid]/pages/[id]/page.tsx`:
  - Pipeline stepper 第二步「元素 Review」点击 → 跳到 `/elements` 页(只在 step 1 done 后 enable)
  - 或加一个独立的「View Elements」按钮

- [ ] **4.6.2** 五件套:
  ```bash
  npm run typecheck
  npm test            # 期望 ≥ 50 tests pass(Phase 3 的 45 + 新增 ~5)
  npm run lint
  npm run build
  ```

- [ ] **4.6.3** 浏览器实测:
  - Phase 3 数据干净起跑 → 创建项目+页面+上传 → mock Pass 1 跑出来(暂不真实,因为可能没 sankuai key)
  - 进入 Element Review 页 → 看到 4 个 mock 元素的 bbox
  - **拖一个 bbox 改尺寸** → StickySaveBar 出现 → 保存 → reload 还在
  - **空白拉新 bbox** → 弹表单填 name → 保存 → 列表多一条
  - **点列表元素** → canvas 高亮对应 bbox + 详情面板展开
  - **改 description / type** → 保存 → reload 还在
  - **删除元素** → confirm dialog → 列表少一条
  - DevTools console 0 errors

- [ ] **4.6.4** 真实 Pass 1 测(可选,有 sankuai key 时):
  - 在 `/settings/models` 填 sankuai api_key 保存
  - 删 mock elements → 重跑 Pass 1 → 等 ~50s → 看到真实 LLM 输出的 N 个元素

- [ ] **4.6.5** 开 PR

---

## Phase 4 不做的事

- ❌ Polygon outline —— [CLAUDE.md § 5] 已禁
- ❌ Element 联动 / 分组 —— v1
- ❌ canvas 缩放 / 平移 —— Phase 3 测试图 < 1024 像素,不需要;真实大稿可加 v1
- ❌ undo / redo —— v1
- ❌ Element 排序拖拽改 z_index —— v1(改字段值就行)
- ❌ Run Pass 2 接业务 —— Phase 5
- ❌ 真实 e2e Playwright 测试 —— v1

---

## Phase 1-3 沉淀的实施约束(继续生效)

| 现象 | 应对 |
|---|---|
| Client 拉 `node:fs` | Pass 1 prompt 渲染 / Element 解析 必须在 server route 做 |
| `exactOptionalPropertyTypes` | 条件 spread(SPEC 字段 ?: 时) |
| LLM 返回 markdown code fence 包 JSON | strip ```json ... ``` 后 parse;parse 失败回 pass1_failed |
| canonical-512.png 实际 236×512 | 测试用真实图时按实际尺寸断言 |

---

## 风险预警

| 风险 | 触发 | 缓解 |
|---|---|---|
| sankuai gemini Pass 1 ~50s | 真实跑时 UI 卡 | StickySaveBar 期间 spinner;前端 polling pipeline-runs 实时显示状态 |
| LLM 输出 JSON 解析失败(返回 markdown 代码块) | gemini 偶尔不严格 | parse 前 strip ```json 标记;parse 失败 → pass1_failed,UI 提示重试,**不丢已有 elements** |
| LLM bbox 越界 / 非 normalized | 提示词强调 0-1,但模型偶尔违反 | 服务端 clamp 到 [0,1],并截断超出图像范围 |
| Cross-state alignment 失败 | 同物理实体 entity_name 不一致 | Pass 1 prompt 已强调,但 LLM 失误时 → UI 上用户可手动合并(Phase 4 暂不做合并 UI,Phase 5 v1) |
| Canvas bbox 拖拽频繁 setState 性能 | N=30 元素同时渲染 + drag | 拖拽时 onMouseMove 用 `requestAnimationFrame` 节流;onMouseUp 才触发 onChange 真正提交 |
| 多 state 切换时元素列表跳变 | 切到 hover state 后,只在 canonical 出现的元素是否显示? | 列表全显示,canvas 只描出 `state_ids.includes(currentState)` 的;切换时不变列表 |

---

## Files 总览

```
src/lib/
├── llm-client.ts                    # 改:加 callMllm 完整调用
├── pass1-runner.ts                  # NEW
├── api/elements-client.ts           # NEW
└── __tests__/pass1-runner.test.ts   # NEW

src/app/
├── api/states/[id]/pass1/route.ts   # 改:替换 mock
└── api/pages/[id]/elements/route.ts # NEW(GET + PUT)

src/app/projects/[pid]/pages/[id]/
├── page.tsx                         # 改:Pipeline stepper 第 2 步加 link
└── elements/page.tsx                # NEW 主页面

src/components/element-review/
├── canvas.tsx                       # NEW
├── canvas-toolbar.tsx               # NEW
├── element-list.tsx                 # NEW
└── element-detail-panel.tsx         # NEW
```

预计 ~10 新文件 + ~3 改文件,5-7 commit。

---

**子 plan 版本**:v0.1 (2026-05-14)
**配套主 plan**:[PLAN.md](../../PLAN.md) Phase 4
**前置 phase**:Phase 3 ✅
