# Phase 6:CDN 上传 + Export(子 plan)

> **状态**:🔴 未开始
> **目标**:S3 兼容 CDN 单/批上传 → `lib/exporter.ts` 生成 SPEC § Export 文件结构整树(`config.json` / `meta.json` / `states/{name}.json` / `assets/manifest.json` / `spec.md` / `raw/*.png`)→ `archiver` zip 流式输出 → Export UI 页面(树形预览 + Open folder + Download zip);Pipeline stepper 第 5/6 步接业务
> **退出**:配 cdn provider 后能批量上传 N 个 type=static asset,manifest.json 写入 cdn_url;不配 cdn 时 manifest.json 干净写 null;Export 出文件夹丢给 Claude Code 能直接读 spec.md 并理解全部状态/元素
> **预估**:3-4 天
> **配套文档**:[PLAN.md](../../PLAN.md) Phase 6 / [SPEC.md § Export](../../SPEC.md) / [SPEC.md § CDN](../../SPEC.md) / [CLAUDE.md § Export 后产物契约](../../CLAUDE.md)

---

## 分支与 commit 节奏

- **分支**:`feat/phase-6-cdn-export`
- 5 个目标 commit:
  - `feat(lib,api): cdn-uploader + 单 asset 上传`
  - `feat(api): 批量 asset 上传`
  - `feat(lib): exporter + spec.md 模板 + snapshot 单测`
  - `feat(lib,api): zip 流式 export`
  - `feat(ui): Export 页面 + Pipeline stepper 接业务`

---

## Phase 1-5 沉淀(直接复用)

- `cdn-client.ts` Phase 2 加的 `pingCdn` + `parseAccessKey`,Phase 6 加 `uploadAsset` / `uploadAssetsBatch`
- `assets.ts` 的 `getAsset` / `listAssetsByPage` / `readAssetBinary`(读 PNG bytes 准备给 S3)
- `pages.ts` / `states.ts` / `elements.ts` / `pipelines.ts` 已稳定
- `config.ts` 的 `getActiveProvider('cdn')` / `getProviderById`
- `useConfirm` / `EmptyState` / shadcn Card/Button
- Pipeline stepper 已有 `cdn` / `export` 槽位(Phase 5 写死 idle),Phase 6 接真状态

---

## Task 6.1:cdn-uploader + 单 asset 上传

**Files**:
```
src/lib/cdn-client.ts            # 扩展 uploadAsset + buildAssetKey + buildCdnUrl
src/lib/__tests__/cdn-client.test.ts  # 用 @aws-sdk/client-mock 验证 PutObject 参数 + key/URL 拼接
src/app/api/assets/[id]/upload/route.ts  # NEW
src/lib/api/assets-client.ts     # 加 uploadAssetApi
package.json                     # 加 aws-sdk-client-mock devDep
```

- [ ] **6.1.1** `cdn-client.ts` 加导出:
  ```ts
  export function buildAssetKey(projectId: string, pageId: string, assetId: string): string
    // → '{project_id}/{page_id}/{asset_id}.png'
  export function buildCdnUrl(provider: ProviderConfig, key: string): string
    // → public_url_prefix(去尾 /) + '/' + key;public_url_prefix 缺时退回 base_url-style URL
  export async function uploadAsset(provider: ProviderConfig, opts: {
    body: Buffer
    projectId: string
    pageId: string
    assetId: string
  }): Promise<{ cdn_url: string }>
  ```
  实现:复用 `parseAccessKey`,`PutObjectCommand` body=Buffer + ContentType='image/png';成功后返回 `{ cdn_url: buildCdnUrl(provider, key) }`

- [ ] **6.1.2** `aws-sdk-client-mock` 装 devDep,单测:
  - `uploadAsset` 用 mock client 验证 PutObject Bucket / Key / Body / ContentType 正确
  - `buildAssetKey` 拼接形态
  - `buildCdnUrl` 处理 `public_url_prefix` 尾部 `/` 与缺失情况

- [ ] **6.1.3** `POST /api/assets/[id]/upload`:
  - load Asset → 找 page → 找 project → load active cdn provider(或 project.cdn_provider_id 优先)
  - 没 cdn provider → 400 「未配置 active 的 cdn provider」
  - readAssetBinary(asset.id) → uploadAsset(...) → 更新 asset.cdn_url + status='uploaded' + 写盘
  - 返回更新后的 Asset

- [ ] **6.1.4** `assets-client.ts` 加 `uploadAssetApi(id) → Asset`

- [ ] **6.1.5** 五件套 + commit
  ```
  feat(lib,api): cdn-uploader + 单 asset 上传到 S3
  ```

---

## Task 6.2:批量 asset 上传

**Files**:
```
src/lib/cdn-client.ts            # 加 uploadAssetsBatch(串行,逐个 try/catch)
src/app/api/pages/[id]/upload-all-assets/route.ts  # NEW
src/lib/api/assets-client.ts     # 加 uploadAllAssetsApi
```

- [ ] **6.2.1** `uploadAssetsBatch(provider, items)`:串行(`for...of` 不并发,避免 rate limit),每个 item 独立 try/catch,失败的进 `failed: { id, error }[]`,成功的进 `uploaded: { id, cdn_url }[]`

- [ ] **6.2.2** `POST /api/pages/[id]/upload-all-assets`:
  - 找 page + project + active cdn provider
  - listAssetsByPage(pageId) 过滤 `status !== 'uploaded'`(已上传跳过)
  - 调 uploadAssetsBatch
  - 成功的 asset 写盘更新 cdn_url + status='uploaded'
  - 返回 `{ uploaded: AssetID[], failed: { id, error }[] }`

- [ ] **6.2.3** 五件套 + commit
  ```
  feat(api): 批量 asset 上传(串行 + 单个失败不阻断)
  ```

---

## Task 6.3:`lib/exporter.ts` 主体 + spec.md 模板

**Files**:
```
src/lib/exporter.ts              # NEW:核心 exportPage(pageId, outputDir) + renderSpecMd(...)
src/lib/__tests__/exporter.test.ts  # snapshot spec.md + 验证整树文件齐全
```

- [ ] **6.3.1** `exporter.ts` 主函数:
  ```ts
  export type ExportPayload = {
    project: Project
    page: Page
    states: State[]
    elements: Element[]
    assets: Asset[]
    cdnProvider: ProviderConfig | null  // 可空(用户跳过 CDN)
    codingAgentIntro: string
  }

  export async function loadExportPayload(pageId: string): Promise<ExportPayload>
  export async function writeExportFolder(payload: ExportPayload, outputDir: string): Promise<{ path: string }>
  export function renderSpecMd(payload: ExportPayload): string
  export function renderConfigJson(payload: ExportPayload): unknown
  export function renderStateJson(state: State, elements: Element[], assets: Asset[]): unknown
  export function renderManifestJson(assets: Asset[]): Record<string, unknown>
  ```

- [ ] **6.3.2** 文件结构按 SPEC § Export:
  - `{outputDir}/{slug(project.name)}/config.json`
  - `pages/{slug(page.name)}/meta.json`
  - `pages/{slug(page.name)}/states/{slug(state.name)}.json`(每个 state 一份,bbox 反归一化补 `bbox_pixels`)
  - `pages/{slug(page.name)}/assets/{asset_id}.png`(从 `data/assets-bin/{id}.png` 拷)
  - `pages/{slug(page.name)}/assets/manifest.json`(`{asset_id: {filename, cdn_url|null, width, height, element_id}}`)
  - `pages/{slug(page.name)}/spec.md`
  - `pages/{slug(page.name)}/raw/original-{state.name}.png`(从 `data/raw/{state.id}.png` 拷)
  - `pages/{slug(page.name)}/raw/extracted.png`(canonical 的 `data/keyed/{state.id}.png` 拷;不存在时跳过)

- [ ] **6.3.3** `renderSpecMd` 模板字符串拼接,**不引 nunjucks**:
  - H1 page name
  - ## 项目信息(name / route_hint / tech_stack_hint / 状态名列表)
  - ## 状态: {name}(canonical 在前)
    - ### 元素列表 markdown 表(id / type / name / description / asset 或 spec)
    - ### 布局描述(纯函数:按 z_index 排序 + bbox 像素拼自然语言)
  - ## Coding agent 指令(注入 `coding_agent_intro` 内容,`{tech_stack_hint}` 占位用 page.project 反查)

- [ ] **6.3.4** snapshot 单测:
  - 用合成的 fixture(1 project + 1 page + 2 states + 3 elements 含 1 static + 2 code + 1 asset cdn_url=null)
  - `expect(renderSpecMd(payload)).toMatchInlineSnapshot(...)`
  - 跑 `writeExportFolder` 到 tmp dir + 检查文件齐全(用 fs.access)+ 检查 manifest.json cdn_url=null 干净写入

- [ ] **6.3.5** 五件套 + commit
  ```
  feat(lib): exporter + spec.md 模板 + snapshot 单测
  ```

---

## Task 6.4:zip 流式输出

**Files**:
```
package.json                            # 加 archiver + @types/archiver
src/lib/exporter.ts                     # 加 streamExportZip(payload) → ReadableStream
src/app/api/pages/[id]/export/route.ts  # NEW(folder/zip 二选一)
src/lib/api/export-client.ts            # NEW(client fetch)
```

- [ ] **6.4.1** `npm i archiver` + `npm i -D @types/archiver`

- [ ] **6.4.2** `streamExportZip(payload): ReadableStream`(纯流式,不缓存到内存):
  - 用 `archiver('zip')` + Node `Readable` → Web `ReadableStream`(`Readable.toWeb`)
  - archiver 边添加文件边推到 stream
  - **关键**:`finalize()` 用 fire-and-forget(不能 await,否则全缓存),让 Web stream 自然消费

- [ ] **6.4.3** `POST /api/pages/[id]/export`:
  - body `{ format: 'folder' | 'zip', output_dir?: string }`
  - format='folder':校验 `output_dir`(必填,绝对路径,不存在自动创建父目录),`writeExportFolder` → 200 `{ path }`
  - format='zip':返回 `Response(streamExportZip(payload), { headers: { 'Content-Type': 'application/zip', 'Content-Disposition': 'attachment; filename="..."' } })`

- [ ] **6.4.4** 单测验证 folder 路径产物;zip 走最小烟测(返回 200 + Content-Type)

- [ ] **6.4.5** 五件套 + commit
  ```
  feat(lib,api): zip 流式 export + folder export 路由
  ```

---

## Task 6.5:Export UI 页面 + Pipeline stepper 第 5/6 步接业务

**Files**:
```
src/app/projects/[pid]/pages/[id]/export/page.tsx  # NEW
src/components/pages/pipeline-stepper.tsx          # 扩展:接 cdn / export step 推断
src/components/asset-review/asset-detail-panel.tsx # 加「上传 CDN」按钮(已有 placeholder,接业务)
src/app/projects/[pid]/pages/[id]/assets/page.tsx  # 顶部加「批量上传 CDN」按钮 + 跳到 Export
```

- [ ] **6.5.1** Export 页面:
  - 加载 page + states + elements + assets
  - 树形预览(纯文本 `<pre>` 拼接,不上 react-treeview):列出整树 + 每行末尾加注释(如 `← coding agent 主入口`)
  - 操作区:
    - 「Open folder」:输入 `output_dir`(默认 `~/img2ui-out`)+ 按钮 → POST `/api/.../export?format=folder` → 成功后 `toast.success(path)` + 给个「打开目录」按钮(macOS `open`,服务端 child_process,放 `/api/.../open-folder`)
    - 「Download zip」:直接 `<a href>` 拿 zip(form post 改 GET 烦,用 fetch + Blob → `URL.createObjectURL` + 点击)

- [ ] **6.5.2** `pipeline-stepper.tsx`:
  - 加 props `assets: Asset[]` 推断 step 5(cdn 上传)状态:
    - 0 个 type=static element 时 → done(无需上传)
    - 全部 asset uploaded → done
    - 部分 uploaded → running(展示 `n/m`)
    - 全 idle → idle
    - 任何 failed → failed
  - step 6(export)状态:本地不持久化 export run,简化为 idle / done(基于「是否所有 asset 都已 uploaded 或 cdn 配置缺失」启发式),Phase 6 v1 直接看 step 5 状态决定是否 enable export 链接

- [ ] **6.5.3** `asset-detail-panel.tsx` 已有 placeholder:加「上传 CDN」按钮,调 `uploadAssetApi(asset.id)`(无 cdn provider 时按钮 disabled + tooltip)

- [ ] **6.5.4** Asset Review 页顶部加「批量上传 CDN」按钮(state 是 pass2_done 时 enable),POST `/api/pages/[id]/upload-all-assets` → 成功后刷新 + `toast.success`,Pipeline stepper 接收新数据

- [ ] **6.5.5** Pipeline stepper 第 6 步「Export」点击 → 跳到 `/projects/[pid]/pages/[id]/export`(始终 enabled,即使 step 5 idle 也允许 export — 用户主权 > 系统判断,SPEC § CDN 上传规定可跳过)

- [ ] **6.5.6** 五件套 + commit
  ```
  feat(ui): Export 页面 + Pipeline stepper 接 CDN/Export 业务
  ```

---

## Task 6.6:Open folder 端点(macOS 体验加分,可选)

**Files**:
```
src/app/api/system/open-folder/route.ts  # POST { path } → child_process.exec('open ...')
```

- [ ] **6.6.1** 简单 POST endpoint,接受绝对路径,白名单校验前缀(必须在 `~/img2ui-out` 或用户 `default_export_dir` 下),用 `child_process.exec`('open ' 路径)。**只在 macOS 启用**(`process.platform === 'darwin'`),其他平台返回 501

- [ ] **6.6.2** 不写单测(child_process exec 难 mock,且本特性是 nice-to-have)

- [ ] **6.6.3** 五件套 + 合到 6.5 commit(避免凑数 commit)

---

## Task 6.7:验证 + PR

- [ ] **6.7.1** 五件套全过(`npx tsc --noEmit && npm test && npm run lint && npm run build`)
- [ ] **6.7.2** Playwright 端到端(本 plan 由 opus subagent 执行):
  - 启 dev server
  - 设置 cdn provider(可选,无时跳过批量上传走 cdn_url=null 路径)
  - 进 Export 页 / 看树形预览 / Download zip / 检查 zip 内容
  - 检查 spec.md / manifest.json / states json 与 SPEC 契约一致
- [ ] **6.7.3** PR:`gh pr create --base main --head feat/phase-6-cdn-export`,description 4 段(改了什么 / 为什么 / 怎么验证 / 向后兼容)
- [ ] **6.7.4** 用户授权本次自合 → `gh pr merge <n> --merge` + `git branch -D feat/phase-6-cdn-export`

---

## Phase 6 不做的事

- ❌ S3 多 part upload(asset PNG 通常 < 1 MB,单 PutObject 够用)
- ❌ 上传进度 SSE(YAGNI,直接 await + spinner;真有几十个 asset 再说)
- ❌ Export 模板用户自定义(`coding_agent_intro` 已经是用户可改,模板正文写死)
- ❌ Cross-state diff 在 spec.md 的精细渲染(v1 只列「相对 canonical 变化的 element id」,详细 diff Phase 7 dogfood 时按需补)
- ❌ Export run 持久化(每次点击立即生成,不存 ExportRun JSON;失败用户重点即可)
- ❌ S3 region 自动探测(用户自填)
- ❌ CDN 列表/CRUD 之外的 provider 维度(已 Phase 2 完成)

---

## 风险预警

| 风险 | 缓解 |
|---|---|
| `archiver` + Next.js 16 Route Handler 流式响应,`finalize()` 时机不对会全缓存内存 | 用 `Readable.toWeb`,`finalize()` fire-and-forget,先写最小烟测确认实际流出。退路:同步生成到 tmp 文件再 `createReadStream` 流出(占盘但稳定) |
| spec.md 模板易漏字段(bbox_pixels / shape_spec / coding_agent_intro 注入 / cross_state_notes) | inline snapshot 单测覆盖一个真实数据形态;PR 包含 fixture |
| `cdn_url: null` fallback 路径写错 | snapshot 单测专门跑「无 cdn provider」case,manifest.json 必须 `{ "asset_id": { ..., "cdn_url": null, ... } }` 干净写入 |
| @aws-sdk/client-s3 PutObject body 类型在 Node `Buffer` 与 `Uint8Array` 兼容 | aws-sdk v3 接受 Buffer(已 Phase 2 验证 HeadBucket 正常),仍写单测固化形态 |
| `@types/archiver` 与 archiver 版本对不齐 → 类型报错 | 装时锁定 `archiver@7` + `@types/archiver@6`(已知配对) |
| `child_process.exec('open ...')` 路径包含空格/中文 → 命令注入 / 失败 | 路径用单引号包,`output_dir` 白名单前缀校验,跳过非 darwin 平台 |
| Export 时同 page 多个 state 文件名冲突(都叫 `canonical.json`) | 用 `slug(state.name)` 而非 id,但 slug 冲突要计数加后缀(简单 `name-2.json`) |
| 项目名/页名含特殊字符破坏文件名 | 实现一个最小 `slug(s)` 函数:小写 + 中文保留 + 非 [\w一-龥-] → `-`;trim;空值 fallback `untitled` |

---

## Files 总览

```
src/lib/
├── cdn-client.ts          # 改:加 uploadAsset / uploadAssetsBatch / buildAssetKey / buildCdnUrl
├── exporter.ts            # NEW:loadExportPayload / writeExportFolder / streamExportZip / renderSpecMd / renderConfigJson / renderStateJson / renderManifestJson / slug
└── api/
    ├── assets-client.ts   # 改:加 uploadAssetApi / uploadAllAssetsApi
    └── export-client.ts   # NEW

src/app/api/
├── assets/[id]/upload/route.ts            # NEW
├── pages/[id]/upload-all-assets/route.ts  # NEW
├── pages/[id]/export/route.ts             # NEW(folder + zip 双 format)
└── system/open-folder/route.ts            # NEW(macOS only)

src/app/projects/[pid]/pages/[id]/export/page.tsx  # NEW

src/components/
├── pages/pipeline-stepper.tsx                       # 改:接 cdn / export step
├── asset-review/asset-detail-panel.tsx              # 改:接「上传 CDN」按钮
└── (Asset Review 主页)                              # 改:加「批量上传 CDN」按钮
```

---

**子 plan 版本**:v0.1 (2026-05-14)
**配套主 plan**:[PLAN.md](../../PLAN.md) Phase 6
**前置 phase**:Phase 5 ✅
