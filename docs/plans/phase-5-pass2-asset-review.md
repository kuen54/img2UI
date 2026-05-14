# Phase 5:真实 Pass 2 + Asset Review(子 plan)

> **状态**:🔴 未开始
> **目标**:Phase 4 mock-able mock 替换为完整真实 Pass 2 链路:apimart submit/poll/download → 本地 chroma green key → scipy-style 切片 → Asset Review UI(batch PNG 预览 + 切片 grid + 单元素重抠 / edge clean)
> **退出**:配 sankuai + apimart key 后,选 1+ 个 type=static 的 element → Run Pass 2 → 等 ~3min → Asset Review 显示 batch PNG + N 张切片 + 状态 badge;reload 持久
> **预估**:5-7 天
> **配套文档**:[PLAN.md](../../PLAN.md) Phase 5 / [SPEC.md § Pass 2](../../SPEC.md) / [CLAUDE.md § 6 § 7](../../CLAUDE.md) / `ref/split_elements.py`(scipy 实现参考)

---

## 分支与 commit 节奏

- **分支**:`feat/phase-5-pass2-asset-review`
- 5 个目标 commit:`feat(client)` apimart async + chroma key / `feat(pipeline)` pass2-runner / `feat(api)` /api/states/[id]/pass2 + asset routes / `feat(ui)` Asset Review / `docs` README

---

## Phase 1-4 沉淀(直接复用)

- `llm-client.ts` Phase 4 加的 `callMllm`,Phase 5 加 `callImageGen`(apimart async)
- `pipelines.ts` PipelineRun CRUD
- `pass1-runner.ts` 模式参考(acquireLock + provider + run + status flow)
- `elements.ts` getElementsByPage(读 type=static 元素 + name/description 喂 prompt)
- `image-meta.ts` 已有 sharp(Phase 5 大量用)
- `useConfirm` / `StickySaveBar` / `EmptyState` 等共享 UI

---

## Task 5.1:Image gen async client + chroma key + slicer(三个 lib)

**Files**:
```
src/lib/llm-client.ts            # 扩展 callImageGen async submit/poll/download
src/lib/alpha-key.ts             # NEW chroma green key (numpy 等价 in JS)
src/lib/slicer.ts                # NEW scipy binary_dilation + connected component(纯 JS port)
src/lib/__tests__/alpha-key.test.ts
src/lib/__tests__/slicer.test.ts
```

- [ ] **5.1.1** `callImageGen` 扩展(只支持 apimart + openai-sync 两种,SPEC § Provider 调用模式 § image generation):
  ```ts
  export async function callImageGen(provider: ProviderConfig, opts: {
    prompt: string
    reference_image_base64?: string  // data URL
    size?: string  // '1:1' / '9:16'
    resolution?: string  // '1k' / '2k'
    quality?: 'low' | 'medium' | 'high'
    n?: number
    signal?: AbortSignal
  }): Promise<{ image: Buffer; cost?: number; latency_ms: number }>
  ```
  - apimart(is_async=true):POST submit → 拿 task_id → poll(initial 12s + 5s/次,最多 24 次)→ download with 浏览器 UA(否则 S3 403)
  - openai sync(is_async=false):POST /images/generations + b64_json 直接返回
  - return Buffer(PNG bytes)

- [ ] **5.1.2** `alpha-key.ts` chroma green key(SPEC § 抠图算法):
  ```ts
  // 参数 g_excess > 60 → α=0,< 25 → α=255,中间 ramp;不透明像素压绿溢色
  export async function chromaGreenKey(greenScreenPng: Buffer, opts?: {
    full_alpha_threshold?: number   // 默认 60
    full_opaque_threshold?: number  // 默认 25
    spill_suppression?: boolean     // 默认 true
  }): Promise<Buffer>  // RGBA PNG
  ```
  实现:`sharp(buf).raw().toBuffer({ resolveWithObject: true })` 拿 raw RGB(A?) 像素,逐像素计算 g_excess,组合 RGBA,sharp 写回 PNG。

- [ ] **5.1.3** `slicer.ts` 切片(scipy 等价 port,SPEC § 切片算法):
  ```ts
  export async function sliceAssets(transparentPng: Buffer, opts?: {
    gap?: number              // 默认 15
    padding?: number          // 默认 5
    min_size?: number         // 默认 30
    min_opaque_pct?: number   // 默认 1.0
  }): Promise<Array<{ buffer: Buffer; bbox: [number, number, number, number] /* px */; opaque_pct: number }>>
  ```
  实现思路:
  1. sharp 拿 alpha mask buffer
  2. binary_dilation:用 BFS 实现 N 步膨胀(N=gap)
  3. connected component labeling:union-find 8 邻接
  4. 每个连通块算 bbox(min/max x/y)+ 加 padding + 过滤 min_size + 过滤 opaque_pct
  5. sharp `.extract({ left, top, width, height })` 切原透明 PNG → 返回 Buffer

- [ ] **5.1.4** 单测:用 PoC `outputs/v11-keyed.png`(如果还在 gitignore 之外)或合成测试图测 chroma key + slicer

- [ ] **5.1.5** Commit
  ```
  feat(lib): chromaGreenKey + sliceAssets(scipy port to TS)+ callImageGen async
  ```

---

## Task 5.2:`pass2-runner.ts` 主编排

**Files**:
```
src/lib/pass2-runner.ts                        # NEW
src/app/api/states/[id]/pass2/route.ts         # NEW(替换占位)
src/app/api/elements/[id]/re-extract/route.ts  # NEW
src/app/api/states/[id]/keyed/route.ts         # NEW(serve keyed PNG 给前端 batch 预览)
src/lib/assets.ts                              # NEW Asset CRUD
src/lib/__tests__/pass2-runner.test.ts
```

- [ ] **5.2.1** `assets.ts`:`createAsset` / `getAsset` / `listAssetsByPage` / `deleteAsset`(写 `data/assets/{id}.json`,asset_id == element_id;PNG 在 `data/assets-bin/{id}.png`)

- [ ] **5.2.2** `pass2-runner.ts` 主编排:
  ```
  runPass2(state_id):
    1. acquireLock state:{id}
    2. 取 active image_gen + active mllm provider(后者 Phase 5 暂不用,留给 validate)
    3. getState + getPage + getElementsByPage
    4. 过滤 type=static elements(只对 static 跑提取)
    5. 渲染 element_summary(SPEC § Pass 2 prompt 模板渲染规则:按 name 分组)+ 拼 prompt
    6. 创建 PipelineRun(running)+ pass2_running
    7. 读 raw PNG → callImageGen(green-screen prompt + reference image)
    8. PNG 写到 data/pass2/{state_id}.png(留底)
    9. chromaGreenKey(buffer) → data/keyed/{state_id}.png
    10. sliceAssets(keyed buffer) → 数组 → 按 (y_center, x_center) 排序
    11. 元素到切片映射:数量相同时按顺序对应;数量不同时尾部多出来的归到 unassigned 列表(用户在 Asset Review 手动调)
    12. 每个对应的切片写到 data/assets-bin/{element_id}.png + 创建 Asset(status=extracted)
    13. setPipelineStatus pass2_done + completeRun
    14. releaseLock
  ```
  错误处理:任何一步失败 → failRun + pass2_failed,不丢已有 assets

- [ ] **5.2.3** `re-extract` route:单元素版,只渲染该元素到 element_summary,产出 → key → slice → 取最大 opaque_pct 的切片替换 asset

- [ ] **5.2.4** Routes:
  - `POST /api/states/[id]/pass2` → `await runPass2(state_id)` → 202 { run_id }
  - `POST /api/elements/[id]/re-extract` → 202 { run_id }
  - `GET /api/states/[id]/keyed` → 直接返回 keyed PNG bytes(用于 Asset Review 顶部 batch PNG 预览)

- [ ] **5.2.5** Commit
  ```
  feat(pipeline,api): Pass 2 主编排 + re-extract + assets lib
  ```

---

## Task 5.3:Asset Review UI

**Files**:
```
src/app/projects/[pid]/pages/[id]/assets/page.tsx        # NEW Asset Review 主页
src/components/asset-review/batch-png-viewer.tsx          # 顶 batch PNG(可切 keyed/绿幕原)
src/components/asset-review/asset-grid.tsx                # 切片 grid
src/components/asset-review/asset-detail-panel.tsx        # 选中详情:大图 + 校验 + actions
src/lib/api/assets-client.ts                              # client fetch 封装
```

- [ ] **5.3.1** `batch-png-viewer.tsx`:
  - 显示 `/api/states/{state_id}/keyed`(透明棋盘格背景)
  - toggle:`keyed` ↔ `绿幕原图`(后者走 `/api/states/{state_id}/pass2-raw` 待加)
  - hover 元素 → 70% 暗化非该元素(Phase 5 v1,先静态)

- [ ] **5.3.2** `asset-grid.tsx`:每 asset 一格(缩略图 + name + 尺寸 + 状态 icon ✓/⚠/✗ 来自 alpha_quality)

- [ ] **5.3.3** `asset-detail-panel.tsx`:
  - 大图预览(透明棋盘格)
  - 字段:alpha_quality / validation_notes
  - Actions:`Edit description & re-extract` / `Manual upload override`(本地选 PNG 替换)/ `Upload to CDN`(Phase 6)
  - **Phase 5 不实现 chroma threshold slider / edge clean tool**(标 v1)

- [ ] **5.3.4** Asset Review 主页:
  - 加载 elements + assets(filter type=static)
  - state 切换器(顶部,影响 batch PNG)
  - 顶部 batch PNG / 中 grid / 底 detail panel(选中时)
  - 「Run Pass 2」按钮(state 是 pass1_done 时 enable)

- [ ] **5.3.5** page detail 页 Pipeline stepper 第 3 步「资产提取」点击 → 跳到 `/assets`

- [ ] **5.3.6** Commit
  ```
  feat(ui): Asset Review 页面 + batch PNG + asset grid + 详情 panel
  ```

---

## Task 5.4:验证 + PR

- [ ] 五件套
- [ ] 浏览器:有 sankuai+apimart key 时端到端跑通,产出实际 asset PNG。没 key 时只能验证 UI 渲染
- [ ] PR

---

## Phase 5 不做的事

- ❌ Pass 2 反向校验 LLM 调用(SPEC 已设计但 Phase 5 v1 推迟,assets 直接 `validated` 状态写入)
- ❌ Edge clean tool / 局部 alpha 编辑 —— v1
- ❌ Chroma threshold slider 实时预览 —— v1
- ❌ Asset 拆分 / 合并 工具 —— v1(用户重抠绕开)
- ❌ CDN 上传 —— Phase 6
- ❌ Export —— Phase 6

---

## 风险预警(主要是技术实现)

| 风险 | 缓解 |
|---|---|
| Pass 2 实跑 ~$0.17/页 + 60-220s | UI spinner + 2s 轮询 pipeline-runs;前端「Run Pass 2」前 confirm dialog 提示成本 |
| chroma key 性能(1024×1024 = 1M 像素逐像素 JS 循环) | 用 sharp `.raw()` 一次读全 buffer,Uint8Array 上跑 typed loop;实测应 < 200ms |
| binary_dilation 8 邻接 N=15 步性能 | naive O(N × W × H × 8) 会慢;用 truth value flat array + 双缓冲就 OK,1024² × 15 ≈ 1.5e8 ops ~< 1s |
| union-find connected component 大对象 | 1M 像素 union-find 内存 4MB(int32),OK |
| apimart download S3 在 Node fetch 没 UA | callImageGen 显式加 `headers: { 'User-Agent': 'Mozilla/...' }` |
| 切片数 ≠ 元素数 | mapping 走「按位置排序对应」+ 多出 / 不足部分 → Asset Review 手动调(Phase 5 不实现 reassign UI,标 v1;Phase 5 接受错位,用户重抠) |

---

## Files 总览

```
src/lib/
├── llm-client.ts              # 改:扩展 callImageGen async
├── alpha-key.ts               # NEW
├── slicer.ts                  # NEW(scipy port)
├── pass2-runner.ts            # NEW
├── assets.ts                  # NEW
└── api/assets-client.ts       # NEW

src/app/api/
├── states/[id]/pass2/route.ts # NEW
├── states/[id]/keyed/route.ts # NEW
├── elements/[id]/re-extract/route.ts  # NEW
└── assets/[id]/route.ts       # NEW(GET / DELETE,Phase 5 主要 GET 用)

src/app/projects/[pid]/pages/[id]/assets/page.tsx  # NEW

src/components/asset-review/
├── batch-png-viewer.tsx
├── asset-grid.tsx
└── asset-detail-panel.tsx
```

---

**子 plan 版本**:v0.1 (2026-05-14)
**配套主 plan**:[PLAN.md](../../PLAN.md) Phase 5
**前置 phase**:Phase 4 ✅
