# Phase 2:Provider 配置 + Settings UI(子 plan)

> **状态**:🔴 未开始
> **目标**:Settings 页能 CRUD 三类 provider(mllm / image_gen / cdn)+ 编辑 prompts;Test Connection 按 kind 调对应端点;API key 双向 mask 不泄漏到前端
> **退出**:在 `/settings/models` 新建 / 编辑 / 测试 / 删除一个真实 OpenAI mllm provider 端到端,API key 在网络面板看是 `sk-***xxxx`;首启动后 `data/config.json` 自动 seed
> **预估**:3-4 天
> **配套文档**:[PLAN.md](../../PLAN.md) Phase 2 / [SPEC.md § Provider 调用模式](../../SPEC.md#provider-调用模式) / [PRD.md § Use Case 1](../../PRD.md) / [CLAUDE.md § 注意事项 § 与 LLM 交互](../../CLAUDE.md)

---

## 分支与 commit 节奏

按 [AGENTS.md § 1-3]:

- **分支**:`feat/phase-2-provider-config`(单 PR 多 commit)
- **commit**:每 Task 1-2 个 commit,`feat(api)` / `feat(ui)` / `feat(config)` / `feat(client)` 等 scope
- **PR**:Phase 2 完成后整体 PR `feat: Phase 2 Provider 配置 + Settings UI`
- **不直接 push main**

---

## Phase 1 沉淀(已就位,直接复用)

Phase 2 不需要重写以下,直接 import:

| 模块 | 文件 | 提供 |
|---|---|---|
| Config 持久化 | `src/lib/config.ts` | `loadConfig()` / `saveConfig()` / `maskKey` / `maskConfig` / `unmaskApiKeys` |
| Provider 默认 seed | `src/lib/seeds/default-providers.ts` | 4 个默认 provider(sankuai / apimart / 2 个 OpenAI) |
| Prompt 默认 seed | `src/lib/seeds/default-prompts.ts` | 4 段(pass1 / pass2 / validate / coding agent intro) |
| 类型 | `src/lib/types.ts` | `AppConfig` / `ProviderConfig` / `ProviderKind` 等 |
| ID 生成 | `src/lib/id.ts` | `newProviderId()` |
| 原子写 + 读 JSON | `src/lib/fs-utils.ts` | `writeAtomic` / `readJson` / `writeJson` |
| CSRF gate | `src/proxy.ts` | 自动应用到 `/api/*`(写方法) |
| Settings layout 框架 | `src/app/settings/layout.tsx` | 顶部 `设置` 标题 + 三 tab 导航 |
| 三个空态子页 | `src/app/settings/{models,cdn,prompts}/page.tsx` | Phase 2 替换为业务内容 |

---

## Task 2.1:LLM client minimal — Test Connection 用

**目标**:`src/lib/llm-client.ts`(最小版),按 `api_format` 分发 chat completions ping。Phase 4 会扩展同一文件加 retry / response 解析。Phase 2 这里只要"能发请求并判断成功/失败"

**Files**:
```
src/lib/llm-client.ts                       # mllm 三种 api_format ping
src/lib/__tests__/llm-client.test.ts        # 用 vi.mock 测 dispatch 路由(不发真实请求)
```

- [ ] **2.1.1** 写 `src/lib/llm-client.ts`
  ```ts
  import type { ProviderConfig } from '@/lib/types'

  export type PingResult = { ok: true; latency_ms: number } | { ok: false; error: string }

  // 5-token chat ping,按 api_format 分发
  export async function pingMllm(provider: ProviderConfig): Promise<PingResult> {
    if (provider.kind !== 'mllm') return { ok: false, error: `not mllm: ${provider.kind}` }
    const t0 = Date.now()
    try {
      switch (provider.api_format) {
        case 'openai':
        case 'apimart':   // apimart chat 也是 OpenAI 兼容
          await openaiCompatPing(provider, /* bearer */ true)
          break
        case 'sankuai':
          await openaiCompatPing(provider, /* bearer */ false)
          break
        case 'anthropic':
          await anthropicPing(provider)
          break
        default:
          return { ok: false, error: `unsupported api_format: ${provider.api_format}` }
      }
      return { ok: true, latency_ms: Date.now() - t0 }
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  }

  async function openaiCompatPing(p: ProviderConfig, withBearer: boolean): Promise<void> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': withBearer ? `Bearer ${p.api_key}` : p.api_key,
    }
    const body = {
      model: p.model,
      messages: [{ role: 'user', content: 'ping' }],
      max_tokens: 5,
      temperature: 0,
    }
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 30_000)
    try {
      const res = await fetch(`${p.base_url}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: ctrl.signal,
      })
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`)
      }
    } finally {
      clearTimeout(timer)
    }
  }

  async function anthropicPing(p: ProviderConfig): Promise<void> {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 30_000)
    try {
      const res = await fetch(`${p.base_url}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': p.api_key,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: p.model,
          max_tokens: 5,
          messages: [{ role: 'user', content: 'ping' }],
        }),
        signal: ctrl.signal,
      })
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`)
      }
    } finally {
      clearTimeout(timer)
    }
  }
  ```

- [ ] **2.1.2** 写 mocked 单测(用 `vi.spyOn(global, 'fetch')`),覆盖 3 条路径 + 1 条不支持的 api_format

- [ ] **2.1.3** 跑 `npm test` 确认 + commit
  ```
  feat(client): llm-client ping(openai/sankuai/anthropic chat completions)
  ```

---

## Task 2.2:ImageGen client + S3 client(测试连接)

**目标**:image_gen 的 sync(OpenAI)和 async(apimart)两条路径都能测连通性;cdn S3 走 HeadBucket

**Files**:
```
src/lib/llm-client.ts                       # 扩展 pingImageGen
src/lib/cdn-client.ts                       # pingCdn(HeadBucket)
src/lib/__tests__/llm-client.test.ts        # 加 image_gen 路径
```

- [ ] **2.2.1** 在 `llm-client.ts` 加 `pingImageGen`:
  - `api_format='openai'` + `is_async: false`:发 `POST /images/generations` 最小请求(`size: "256x256"`, `n: 1`, prompt: "test"),只看 200 不看 body
  - `api_format='apimart'` + `is_async: true`:发 `POST /images/generations` submit,期望 `{ status: "submitted", task_id }`,**不轮询**(轮询要钱),只确认 submit 成功就当连通通过
  - apimart 模式必须传 `model` / `quality` / `resolution` / `size`(否则 400)

- [ ] **2.2.2** 写 `src/lib/cdn-client.ts`
  ```ts
  import { S3Client, HeadBucketCommand } from '@aws-sdk/client-s3'
  import type { ProviderConfig } from '@/lib/types'
  import type { PingResult } from '@/lib/llm-client'

  export async function pingCdn(provider: ProviderConfig): Promise<PingResult> {
    if (provider.kind !== 'cdn') return { ok: false, error: `not cdn: ${provider.kind}` }
    if (!provider.bucket || !provider.region) return { ok: false, error: 'missing bucket/region' }
    const t0 = Date.now()
    try {
      const client = new S3Client({
        region: provider.bucket ? provider.region : 'us-east-1',
        endpoint: provider.base_url || undefined,    // 自定义 endpoint(MinIO 等)
        credentials: {
          accessKeyId: parseAccessKey(provider.api_key).id,
          secretAccessKey: parseAccessKey(provider.api_key).secret,
        },
        forcePathStyle: !!provider.base_url,
      })
      await client.send(new HeadBucketCommand({ Bucket: provider.bucket }))
      return { ok: true, latency_ms: Date.now() - t0 }
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  }

  // S3 凭据格式约定:`{access_key_id}:{secret_access_key}` 在 api_key 字段里
  function parseAccessKey(raw: string): { id: string; secret: string } {
    const idx = raw.indexOf(':')
    if (idx < 0) throw new Error('CDN api_key 格式错:应为 "ACCESS_KEY_ID:SECRET_ACCESS_KEY"')
    return { id: raw.slice(0, idx), secret: raw.slice(idx + 1) }
  }
  ```

  > S3 凭据双值的处理思路:复用 `api_key` 字段存 `id:secret`,UI 上是两个 input 但写盘合一字段。这样 mask/unmask 复用一套机制不引入特殊路径

- [ ] **2.2.3** 跑 typecheck + commit
  ```
  feat(client): image_gen + cdn ping(apimart submit / OpenAI sync / S3 HeadBucket)
  ```

---

## Task 2.3:API routes — `/api/config` + `/api/config/test`

**目标**:GET 返回 masked AppConfig;PUT 接受可能含 mask 的 AppConfig,unmask 后写盘;POST test 按 provider_id 取真实 key 测连通,**不返回真实 key**

**Files**:
```
src/app/api/config/route.ts
src/app/api/config/test/route.ts
src/app/api/__tests__/config.test.ts        # 用 vitest + happy-dom 或纯 fetch 测
```

- [ ] **2.3.1** `src/app/api/config/route.ts`
  ```ts
  import { NextRequest, NextResponse } from 'next/server'
  import { loadConfig, saveConfig, maskConfig, unmaskApiKeys } from '@/lib/config'
  import type { AppConfig } from '@/lib/types'

  export async function GET() {
    const config = await loadConfig()
    return NextResponse.json(maskConfig(config))
  }

  export async function PUT(req: NextRequest) {
    const incoming = (await req.json()) as AppConfig
    if (!incoming || typeof incoming !== 'object' || !Array.isArray(incoming.providers)) {
      return NextResponse.json({ error: 'invalid AppConfig' }, { status: 400 })
    }
    const restored = await unmaskApiKeys(incoming)
    await saveConfig(restored)
    return NextResponse.json(maskConfig(restored))
  }
  ```

- [ ] **2.3.2** `src/app/api/config/test/route.ts`
  ```ts
  import { NextRequest, NextResponse } from 'next/server'
  import { loadConfig } from '@/lib/config'
  import { pingMllm, pingImageGen } from '@/lib/llm-client'
  import { pingCdn } from '@/lib/cdn-client'

  export async function POST(req: NextRequest) {
    const { provider_id } = (await req.json()) as { provider_id: string }
    const config = await loadConfig()
    const provider = config.providers.find((p) => p.id === provider_id)
    if (!provider) return NextResponse.json({ ok: false, error: 'provider not found' }, { status: 404 })
    if (!provider.api_key) return NextResponse.json({ ok: false, error: 'api_key 未填' })

    const result =
      provider.kind === 'mllm' ? await pingMllm(provider) :
      provider.kind === 'image_gen' ? await pingImageGen(provider) :
      provider.kind === 'cdn' ? await pingCdn(provider) :
      { ok: false as const, error: `unsupported kind: ${provider.kind as string}` }

    return NextResponse.json(result)
  }
  ```

  > **绝对不返回 raw api_key**——结果对象只含 `{ ok, error?, latency_ms? }`

- [ ] **2.3.3** 单测覆盖:GET 返回 mask / PUT mask 视为「未改动」/ test 拿不到 raw key

- [ ] **2.3.4** 真实 dev server 验证:
  ```bash
  npm run dev
  curl -X PUT http://localhost:3001/api/config \
    -H "content-type: application/json" \
    -H "sec-fetch-site: same-origin" \
    -d '{ ... }'  # 改一个 provider,看 data/config.json 里 api_key 是改后的
  curl http://localhost:3001/api/config | jq '.providers[0].api_key'  # 期望 "sk-***xxxx" / 空串
  ```

- [ ] **2.3.5** Commit
  ```
  feat(api): /api/config GET/PUT + /api/config/test 三端点
  ```

---

## Task 2.4:共享 UI — `useConfirm` + `StickySaveBar` + `EmptyState`

**目标**:把 evalyst 的两件套搬来,以及一个 `EmptyState` 通用空态(替换 Phase 1 占位 page 的硬编码空态)

**Files**:
```
src/components/ui/confirm-dialog.tsx        # useConfirm hook + 全局 mount 点
src/components/ui/sticky-save-bar.tsx       # 固定底部保存条
src/components/ui/empty-state.tsx           # icon + 标题 + 副标题
```

- [ ] **2.4.1** `confirm-dialog.tsx`(Promise-based,用 shadcn Dialog)
  ```ts
  // 用法:
  //   const ok = await useConfirm({
  //     title: '删除 provider「XX」?',
  //     description: '不可撤销',
  //     confirmText: '删除',
  //     destructive: true,
  //   })
  //   if (ok) await fetch(...)
  ```
  实现方式:
  - 提供 `<ConfirmProvider>` 挂在 `app/layout.tsx` body 里
  - `useConfirm()` 返回函数,调用时 push 一个 dialog 状态,resolve Promise

- [ ] **2.4.2** `sticky-save-bar.tsx`(底部固定条,有改动才显示)
  ```tsx
  // 用法:
  //   <StickySaveBar
  //     dirty={JSON.stringify(draft) !== JSON.stringify(saved)}
  //     saving={saving}
  //     onSave={handleSave}
  //     onCancel={() => setDraft(saved)}
  //   />
  ```
  显示条件:`dirty && !saving` 时正常显示;`saving` 时按钮 disabled + spinner

- [ ] **2.4.3** `empty-state.tsx`
  ```tsx
  // 用法:
  //   <EmptyState icon={Folder} title="暂无项目" description="..." />
  ```

- [ ] **2.4.4** 改 layout.tsx 挂 ConfirmProvider;改 `app/projects/page.tsx` 用 EmptyState 替代硬编码

- [ ] **2.4.5** Commit
  ```
  feat(ui): useConfirm + StickySaveBar + EmptyState 共享组件
  ```

---

## Task 2.5:`ProviderCard` 组件(kind-aware)

**目标**:一个通用卡,内部根据 `kind` 渲染不同字段。inline edit(不弹 dialog),改完点底部 StickySaveBar 全局保存

**Files**:
```
src/components/settings/provider-card.tsx
src/components/settings/api-key-input.tsx   # password input + 显示/隐藏 toggle + mask 字符串提示
```

- [ ] **2.5.1** `api-key-input.tsx`
  - input type 切换 password / text
  - 检测当前值是否 mask 字符串(`isMasked` from `lib/config`),是则显示提示「**未改动**(从磁盘还原)」
  - 用户输入新值后,如果不再 match mask pattern,提示消失

- [ ] **2.5.2** `provider-card.tsx`,字段按 kind 显示:
  - **通用**:`name`(input)/ `api_format`(Select 下拉)/ `base_url`(input)/ `api_key`(ApiKeyInput)/ `model`(input,Phase 2 暂不做下拉联动)
  - **mllm/image_gen**:`default_temperature`(Slider 0-2 step=0.1)/ `default_max_tokens`(input number)
  - **image_gen**:`endpoint_kind`(Select 二选)/ `is_async`(Checkbox)/ poll 三个数字 / `default_quality`(Select)
  - **cdn**:`bucket` / `region` / `public_url_prefix`(input × 3)
- [ ] **2.5.3** 卡片 actions:
  - **Test Connection** button:点击 → POST `/api/config/test` → 显示 Badge ok(latency)/ fail(error 摘要前 80 字)
  - **Set Active** button:同 kind 下唯一,UI 把同 kind 其他 provider 的 active 设 false
  - **Delete** button:走 `useConfirm` Promise

- [ ] **2.5.4** Commit
  ```
  feat(ui): ProviderCard kind-aware + ApiKeyInput
  ```

---

## Task 2.6:`/settings/models` 页面

**目标**:展示 mllm + image_gen 两组 provider 卡片,顶部有「+ 新增 mllm」/「+ 新增 image_gen」按钮,底部 StickySaveBar

**Files**:
```
src/app/settings/models/page.tsx
src/app/settings/_lib/use-config-draft.ts   # 私有 hook:fetch + draft state + save
```

- [ ] **2.6.1** `use-config-draft.ts` hook
  ```ts
  // useConfigDraft 模式:
  //   const { saved, draft, setDraft, dirty, saving, save, reload } = useConfigDraft()
  //
  // 内部:
  //   - mount 时 fetch GET /api/config → setSaved + setDraft
  //   - dirty = !deepEqual(draft, saved)
  //   - save():PUT /api/config(发 draft),响应作为新的 saved
  //   - reload():重新 fetch
  ```

- [ ] **2.6.2** `models/page.tsx`
  ```tsx
  'use client'
  // - useConfigDraft
  // - 把 draft.providers 按 kind 分两组(mllm + image_gen),分别 .map 出 ProviderCard
  // - 编辑某 provider:setDraft({ ...draft, providers: [...new array] })
  // - + 新增按钮:根据 kind 构造默认 provider(用 newProviderId() + 默认 api_format='openai' 等),append 到 draft.providers
  // - 底部 StickySaveBar
  // - 删除:useConfirm + 从 draft.providers filter 掉
  ```

- [ ] **2.6.3** 浏览器实测端到端(在 `npm run dev` 下):
  - [ ] 页面 mount 时显示 4 个默认 provider(2 个 mllm + 2 个 image_gen)
  - [ ] 改任一字段,底部 StickySaveBar 出现
  - [ ] 点保存,网络请求 `PUT /api/config` 成功,刷新页面后改动持久
  - [ ] api_key 留空时显示「**未改动**(从磁盘还原)」(用了之前 isMasked 检测)
  - [ ] 填 OpenAI 真实 key → Test Connection → Badge ok + 延迟显示
  - [ ] 删除一个 provider,有 confirm dialog
  - [ ] **DevTools Network 面板查 GET /api/config 响应,api_key 一定是 mask 字符串,不是 raw key**

- [ ] **2.6.4** Commit
  ```
  feat(ui): /settings/models 页 + useConfigDraft hook
  ```

---

## Task 2.7:`/settings/cdn` 页面

**目标**:cdn provider CRUD(规模小,通常只有 1 个 provider)。复用 ProviderCard 的 cdn 分支

**Files**:
```
src/app/settings/cdn/page.tsx
```

- [ ] **2.7.1** 跟 models 页面几乎一样,只过滤 `kind === 'cdn'` 的 provider
- [ ] **2.7.2** Commit
  ```
  feat(ui): /settings/cdn 页
  ```

---

## Task 2.8:`/settings/prompts` 页面

**目标**:四段 prompt 编辑(`pass1_layout` / `pass2_extract` / `pass2_validate` / `coding_agent_intro`)。每段一个折叠卡片,内容是大 textarea

**Files**:
```
src/app/settings/prompts/page.tsx
```

- [ ] **2.8.1** 实现:
  - 复用 useConfigDraft
  - 4 个折叠 Card,每个内部 textarea(用 react-textarea-autosize 或自然 resize)
  - Pass 2 的占位符 (`{{element_summary}}` / `{{element_count}}` / `{{page_description}}`) 在 textarea 上方显示一行说明,告诉用户「以下变量必须保留」
  - 「重置为默认」按钮(每段独立),从 `default-prompts.ts` 拿初值覆盖
  - 底部 StickySaveBar

- [ ] **2.8.2** Commit
  ```
  feat(ui): /settings/prompts 页(四段 prompt 编辑器)
  ```

---

## Task 2.9:Phase 2 退出验证 + PR

- [ ] **V1**:Verification 五件套全过
  ```bash
  npm run typecheck
  npm test            # 期望 ≥ 25 tests pass(Phase 1 的 15 + 新增 ~10)
  npm run lint
  npm run build
  ```

- [ ] **V2**:Phase 2 端到端真实跑(手动浏览器):
  - 删 `data/config.json`(如有)→ 重启 dev → 浏览 `/settings/models` → 自动 seed 4 个默认 provider
  - 编辑 sankuai mllm 的 api_key 填真实 token,**保存** → reload 页面 → 字段是 `***`(magic mask)
  - **Test Connection** 该 provider → 等几秒 → Badge ok
  - 新建一个 OpenAI mllm provider(空 api_key)→ Test Connection → Badge fail「api_key 未填」
  - 填 OpenAI key → Test Connection → Badge ok
  - 删除新建的 → confirm dialog → 确认 → 列表里消失,保存生效
  - **DevTools Network 面板检查 GET /api/config 的响应 JSON**:任何 provider 的 `api_key` 字段一定是 mask 形式(`sk-***xxxx` 或 空串),不是 raw

- [ ] **V3**:`/settings/cdn` 编辑一个测试 bucket,Test Connection 看是否能调通 S3 HeadBucket(可选,需要真实 AWS 凭据)

- [ ] **V4**:`/settings/prompts` 改一段 prompt → 保存 → reload 持久。点「重置为默认」恢复

- [ ] **V5**:Self-review 看自己的 diff:
  - [ ] 没有 dead code / stale 注释 / 未消化 TODO
  - [ ] commit 信息符合 [AGENTS.md § 3]
  - [ ] DevTools console 0 errors / 0 warnings
  - [ ] **api_key 在任何 GET / PUT 响应、任何 console log 里都没出现 raw 形式**

- [ ] **V6**:开 PR
  ```bash
  git push -u origin feat/phase-2-provider-config
  gh pr create --title "feat: Phase 2 Provider 配置 + Settings UI" --body "..."
  ```

---

## Phase 2 不做的事(避免 scope 蔓延 / [AGENTS.md § 5])

- ❌ Provider 字段联动(改 api_format 联动改 model 下拉选项)—— v1
- ❌ 历史 prompt 版本对比 —— v1
- ❌ Provider 模板预设(一键加 sankuai / OpenRouter 等)—— v1
- ❌ Test Connection 显示更详细的错误诊断(token 用量、模型清单等)—— Phase 4 跑真实 Pass 1 时再扩
- ❌ 全局 search / filter provider —— provider 数量小,YAGNI
- ❌ Project / Page CRUD —— Phase 3
- ❌ 真实跑 Pass 1 / Pass 2 —— Phase 4 / 5
- ❌ Playwright e2e —— Phase 4

---

## Phase 1 沉淀的实施约束(避免重蹈覆辙)

| 现象 | 应对 |
|---|---|
| `noUncheckedIndexedAccess` 让 `arr[0]` 是 `T \| undefined` | 用 `arr[0]!` 或 `if (arr[0]) ...`;别 disable |
| `exactOptionalPropertyTypes` 让 shadcn 自动生成的 `theme: undefined` 报错 | 用 `??` fallback 或 type assertion(参考 Phase 1 修 sonner.tsx 的做法) |
| shadcn CLI flag 跟旧文档不同 | `init` 用 `-d`(默认 base-nova preset),不要 `-c <color>`(已被 `--cwd` 占用) |
| Next.js 16 文件约定变化 | 遇到 deprecation warning 立即跟,不积压(参考 middleware → proxy) |
| vitest 不识别 `@/*` alias | 已在 `vitest.config.ts` 配 resolve.alias,新加测试文件直接用 `@/lib/*` import 即可 |
| `data/config.json` 不存在导致测试污染 | 测试 `afterEach` 删 config 文件;或用 `tmpdir` 隔离(`config.test.ts` 第二种思路 v1 再优化) |

---

## 风险预警

| 风险 | 触发场景 | 缓解 |
|---|---|---|
| Test Connection 在某些 provider 下卡 30s | 网络问题 / 错误的 base_url | call 层已加 30s timeout,UI 上点击后 button disabled + spinner,超时显示 fail |
| sankuai gateway 在中国之外不可达 | 海外用户测试 | sankuai mllm 默认 active,但 Test Connection 失败不阻断,UI 提示「检查网络 / 切到备选 OpenAI」 |
| apimart Test Connection 真烧钱 | 非空 prompt 可能扣费即使是 minimal | apimart 的 submit 仅返回 task_id 不消费 quota,只 submit 不 poll 不下载,**0 cost** |
| S3 cred 双值字段在 mask 时只 mask 后半 | `secret_access_key:access_key_id` 用冒号 split,mask 当成单字符串处理 | mask 是「字符串变换」不需要理解结构,raw 完整保留磁盘上,unmask 时整串还原。所以 OK |
| `useConfigDraft` 在用户切 tab 时丢未保存改动 | tab 切换路由触发组件 unmount | StickySaveBar 在 dirty 时 `beforeunload` 弹浏览器原生 confirm,SPA 切路由用 `next/navigation` 的 `useBlock`(需要 Next.js 16 提供;若没有,降级:dirty 时不允许导航,显示 toast「请先保存」) |
| Phase 1 的 `loadConfig()` 在 Phase 2 首次被触发,`data/config.json` 第一次写入 | 浏览器第一次访问 `/settings/models` → GET /api/config → loadConfig() | 这是预期行为,不是 bug。Phase 1 V3 验证条目在这里被自然满足 |

---

## Files 总览

```
src/lib/
├── llm-client.ts                   # NEW - mllm + image_gen ping(Phase 4 扩展)
├── cdn-client.ts                   # NEW - S3 HeadBucket
└── __tests__/llm-client.test.ts   # NEW

src/app/api/
├── config/route.ts                 # NEW
├── config/test/route.ts            # NEW
└── __tests__/config.test.ts       # NEW

src/app/settings/
├── models/page.tsx                 # 替换 Phase 1 占位
├── cdn/page.tsx                    # 替换 Phase 1 占位
├── prompts/page.tsx                # 替换 Phase 1 占位
└── _lib/use-config-draft.ts       # NEW(私有 hook)

src/components/
├── ui/confirm-dialog.tsx           # NEW
├── ui/sticky-save-bar.tsx          # NEW
├── ui/empty-state.tsx              # NEW
└── settings/
    ├── provider-card.tsx           # NEW
    └── api-key-input.tsx           # NEW

src/app/layout.tsx                  # 改:挂 ConfirmProvider
src/app/projects/page.tsx           # 改:用 EmptyState
```

预计 ~12 新文件 + ~3 处修改,5-8 个 commit。

---

**子 plan 版本**:v0.1 (2026-05-14)
**配套主 plan**:[PLAN.md](../../PLAN.md) Phase 2
**前置 phase**:[Phase 1](./phase-1-bootstrap.md) ✅ merged 2026-05-14
