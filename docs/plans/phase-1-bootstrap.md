# Phase 1:项目骨架(子 plan)

> **状态**:🔴 未开始
> **目标**:Phase 0 PoC 已锁定 → 把 Next.js + shadcn + 文件存储 + Sidebar + 顶层 layout 搭出来,跑得动
> **退出**:`npm run dev` 起服务,浏览器看到 Sidebar 渲染正确,`/projects` `/settings` 两个空页面有内容(不是 404),`tsc --noEmit && npm test && npm run lint && npm run build` 全过
> **预估**:2-3 天
> **配套文档**:[PLAN.md](../../PLAN.md) Phase 1 概要 / [SPEC.md](../../SPEC.md) 数据 schema / [CLAUDE.md](../../CLAUDE.md) 反约束 / [AGENTS.md](../../AGENTS.md) 开发流程

---

## 分支与 commit 节奏

按 [AGENTS.md § 1-3]:

- **分支**:`feat/phase-1-bootstrap`(单 PR 多 commit;Phase 1 全程在这个分支)
- **commit 粒度**:每个 Task 1-2 个 commit,subject 用 `feat(scope): ...` / `chore(scope): ...`,scope 可选(此 phase 主要是 `chore` / `feat(ui)` / `feat(lib)` / `feat(security)`)
- **PR**:Phase 1 完成后整体 PR(标题 `feat: Phase 1 项目骨架`)
- **不直接 push main**

---

## Task 1.1:Next.js + TypeScript + shadcn 初始化

**目标**:跑得起来的最小 Next.js + shadcn 工程,但还没有任何业务代码

- [ ] **1.1.1** 创建分支
  ```bash
  cd /Users/lijiakun/Documents/img2UI
  git checkout -b feat/phase-1-bootstrap
  ```

- [ ] **1.1.2** 初始化 Next.js 16(在当前目录,**注意当前目录已有 `*.md` 文档,不要被 create-next-app 覆盖**)
  ```bash
  npx create-next-app@latest . \
    --typescript --tailwind --app --src-dir --import-alias "@/*" \
    --eslint --use-npm
  # 提示「目录非空」时确认 yes 继续
  ```

- [ ] **1.1.3** 升级 `tsconfig.json`:
  ```json
  {
    "compilerOptions": {
      "strict": true,
      "noUncheckedIndexedAccess": true,
      "exactOptionalPropertyTypes": true,
      "noFallthroughCasesInSwitch": true
    }
  }
  ```

- [ ] **1.1.4** 安装 shadcn v4(style: base-nova,color: neutral)
  ```bash
  npx shadcn@latest init -d -s base-nova -c neutral
  npx shadcn@latest add button input label card badge dialog tabs select slider separator checkbox progress sonner textarea
  ```

- [ ] **1.1.5** 安装运行时依赖
  ```bash
  npm install nanoid sharp lucide-react @aws-sdk/client-s3 openai
  npm install --save-dev vitest @types/node @vitest/ui
  ```
  > `openai` SDK 用于 Phase 4 / 5 的调用封装。`@aws-sdk/client-s3` 用于 Phase 6 CDN。Phase 1 不直接用,提前装好

- [ ] **1.1.6** 加 `data/` 到 `.gitignore`(运行时数据,不进版本库)
  ```
  # 在 .gitignore 末尾追加:
  /data
  /data/
  ```

- [ ] **1.1.7** 配置 vitest:写 `vitest.config.ts`
  ```ts
  import { defineConfig } from 'vitest/config'
  export default defineConfig({
    test: {
      include: ['src/**/__tests__/**/*.test.ts'],
      environment: 'node',
    },
  })
  ```
  在 `package.json` `"scripts"` 加:
  ```json
  "test": "vitest run",
  "test:watch": "vitest",
  "typecheck": "tsc --noEmit"
  ```

- [ ] **1.1.8** Verification 一轮(确认起步是干净的)
  ```bash
  npm run typecheck   # 应通过
  npm run lint        # 应通过(create-next-app 默认无 lint 错)
  npm run build       # 应通过
  ```

- [ ] **1.1.9** Commit
  ```bash
  git add .
  git commit -m "chore: 初始化 Next.js 16 + shadcn v4 + 关键依赖"
  ```

---

## Task 1.2:核心 lib 模块

**目标**:`fs-utils` / `id` / `types` / `run-lock` 四个底层模块就位,全部带单测

- [ ] **1.2.1** 写 `src/lib/fs-utils.ts`(原子写 + 读 JSON 工具)
  ```ts
  import { promises as fs } from 'node:fs'
  import path from 'node:path'
  import { nanoid } from 'nanoid'

  export const DATA_ROOT = path.join(process.cwd(), 'data')

  export async function writeAtomic(filepath: string, content: string | Buffer): Promise<void> {
    const dir = path.dirname(filepath)
    await fs.mkdir(dir, { recursive: true })
    const tmp = `${filepath}.tmp.${nanoid(8)}`
    await fs.writeFile(tmp, content)
    await fs.rename(tmp, filepath)
  }

  export async function readJson<T>(filepath: string): Promise<T | null> {
    try {
      const content = await fs.readFile(filepath, 'utf8')
      return JSON.parse(content) as T
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw e
    }
  }

  export async function writeJson<T>(filepath: string, data: T): Promise<void> {
    await writeAtomic(filepath, JSON.stringify(data, null, 2))
  }

  export async function listJsonInDir<T>(dir: string): Promise<T[]> {
    try {
      const files = await fs.readdir(dir)
      const results: T[] = []
      for (const f of files) {
        if (f.endsWith('.json')) {
          const j = await readJson<T>(path.join(dir, f))
          if (j) results.push(j)
        }
      }
      return results
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return []
      throw e
    }
  }
  ```

- [ ] **1.2.2** 写 `src/lib/id.ts`(nanoid 别名)
  ```ts
  import { customAlphabet } from 'nanoid'

  const alpha = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  export const nid6 = customAlphabet(alpha, 6)
  export const nid8 = customAlphabet(alpha, 8)

  export const newProviderId = () => `prv_${nid6()}`
  export const newProjectId = () => `proj_${nid8()}`
  export const newPageId = () => `page_${nid8()}`
  export const newStateId = () => `state_${nid8()}`
  export const newElementId = () => `el_${nid8()}`
  export const newAssetId = () => `asset_${nid8()}`
  export const newRunId = () => `run_${nid8()}`
  ```

- [ ] **1.2.3** 写 `src/lib/types.ts` —— **跟 [SPEC.md § 数据 schema](../../SPEC.md#数据-schema) 完全一致,逐字对照,不允许偏差**

  导出全部类型:`ProviderKind` / `ApiFormat` / `ProviderConfig` / `AppConfig` / `Project` / `Page` / `State` / `StatePipelineStatus` / `Element` / `Asset` / `AssetStatus` / `PipelineRun` / `PipelinePassKind`

  实施约束:
  - 任何字段名 / 类型 / optional 标记 必须跟 SPEC 一字不差
  - 实施时如果发现 SPEC 自相矛盾,先停下改 SPEC(参见 [AGENTS.md § 8 文档同步规则])
  - **不引入 SPEC 没声明的字段**(违反 [AGENTS.md § 5 Plan-外 scope 偏离])

- [ ] **1.2.4** 写 `src/lib/run-lock.ts`([SPEC.md § 文件系统布局 § 并发锁])

  ```ts
  // 单进程内存锁:同一 state_id 的 Pass 1 / Pass 2 / re-extract 互斥
  // 冲突返回 409 Conflict
  type LockKey = string  // 形如 `state:${state_id}` 或 `element:${element_id}`

  const locks = new Map<LockKey, { run_id: string; acquired_at: number }>()

  export class RunLockConflictError extends Error {
    constructor(public lockKey: LockKey, public existingRunId: string) {
      super(`Lock conflict: ${lockKey} held by ${existingRunId}`)
    }
  }

  export function acquireLock(key: LockKey, run_id: string): void {
    const existing = locks.get(key)
    if (existing) throw new RunLockConflictError(key, existing.run_id)
    locks.set(key, { run_id, acquired_at: Date.now() })
  }

  export function releaseLock(key: LockKey): void {
    locks.delete(key)
  }

  export function isLocked(key: LockKey): boolean {
    return locks.has(key)
  }
  ```

- [ ] **1.2.5** 单测 `src/lib/__tests__/fs-utils.test.ts`
  ```ts
  import { describe, it, expect, afterEach } from 'vitest'
  import { writeAtomic, readJson, writeJson, listJsonInDir, DATA_ROOT } from '../fs-utils'
  import path from 'node:path'
  import { promises as fs } from 'node:fs'

  const TEST_DIR = path.join(DATA_ROOT, '_test')

  afterEach(async () => {
    await fs.rm(TEST_DIR, { recursive: true, force: true })
  })

  describe('fs-utils', () => {
    it('writeJson + readJson roundtrip', async () => {
      const tmp = path.join(TEST_DIR, 'roundtrip.json')
      await writeJson(tmp, { hello: 'world' })
      const back = await readJson<{ hello: string }>(tmp)
      expect(back?.hello).toBe('world')
    })

    it('readJson returns null on missing file', async () => {
      const back = await readJson(path.join(TEST_DIR, 'nope.json'))
      expect(back).toBeNull()
    })

    it('listJsonInDir returns empty on missing dir', async () => {
      const list = await listJsonInDir(path.join(TEST_DIR, 'missing'))
      expect(list).toEqual([])
    })

    it('writeAtomic creates parent dir if missing', async () => {
      const tmp = path.join(TEST_DIR, 'deep', 'nested', 'file.txt')
      await writeAtomic(tmp, 'hello')
      const content = await fs.readFile(tmp, 'utf8')
      expect(content).toBe('hello')
    })
  })
  ```

- [ ] **1.2.6** 单测 `src/lib/__tests__/run-lock.test.ts`
  ```ts
  import { describe, it, expect, afterEach } from 'vitest'
  import { acquireLock, releaseLock, isLocked, RunLockConflictError } from '../run-lock'

  afterEach(() => {
    releaseLock('state:test')
  })

  describe('run-lock', () => {
    it('acquire then release', () => {
      acquireLock('state:test', 'run_1')
      expect(isLocked('state:test')).toBe(true)
      releaseLock('state:test')
      expect(isLocked('state:test')).toBe(false)
    })

    it('double acquire throws RunLockConflictError', () => {
      acquireLock('state:test', 'run_1')
      expect(() => acquireLock('state:test', 'run_2')).toThrow(RunLockConflictError)
    })
  })
  ```

- [ ] **1.2.7** 跑测试
  ```bash
  npm test
  # Expected: 6 tests pass
  ```

- [ ] **1.2.8** Commit
  ```bash
  git add src/lib package.json
  git commit -m "feat(lib): fs-utils + id + types + run-lock 基础模块"
  ```

---

## Task 1.3:CSRF middleware

**目标**:`/api/*` 路由 cross-site 拒绝,本地开发不影响

- [ ] **1.3.1** 写 `src/middleware.ts`
  ```ts
  import { NextRequest, NextResponse } from 'next/server'

  export function middleware(req: NextRequest) {
    if (!req.nextUrl.pathname.startsWith('/api/')) return NextResponse.next()
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return NextResponse.next()
    const site = req.headers.get('sec-fetch-site')
    if (site === 'cross-site') {
      return new NextResponse('CSRF blocked', { status: 403 })
    }
    return NextResponse.next()
  }

  export const config = { matcher: '/api/:path*' }
  ```

- [ ] **1.3.2** Commit
  ```bash
  git add src/middleware.ts
  git commit -m "feat(security): CSRF gate via Sec-Fetch-Site"
  ```

---

## Task 1.4:Config seed + AppConfig 启动 bootstrap

**目标**:首启动时检测 `data/config.json` 不存在 → 写入默认 providers + 默认 prompts。后续 GET /api/config 直接读这个文件

- [ ] **1.4.1** 写 `src/lib/seeds/default-providers.ts`(对照 [SPEC.md § Provider 默认 seed],逐字)
  ```ts
  import type { ProviderConfig } from '@/lib/types'
  import { newProviderId } from '@/lib/id'

  // ★★ 跟 SPEC.md § Provider 默认 seed 完全一致,改这份要同步改 SPEC
  export function defaultProviders(): ProviderConfig[] {
    const now = new Date().toISOString()
    return [
      {
        id: newProviderId(),
        kind: 'mllm',
        name: 'sankuai Gemini 3.1 Pro (default)',
        api_format: 'sankuai',
        base_url: 'https://aigc.sankuai.com/v1/openai/native',
        api_key: '',
        model: 'gemini-3.1-pro-preview',
        default_temperature: 1,
        default_max_tokens: 12000,
        vision_capable: true,
        active: true,
        created_at: now,
        updated_at: now,
      },
      {
        id: newProviderId(),
        kind: 'image_gen',
        name: 'apimart gpt-image-2-official (default)',
        api_format: 'apimart',
        base_url: 'https://api.apimart.ai/v1',
        api_key: '',
        model: 'gpt-image-2-official',
        endpoint_kind: 'image_generation',
        is_async: true,
        poll_interval_seconds: 5,
        poll_initial_delay_seconds: 12,
        poll_max_attempts: 24,
        default_quality: 'high',
        active: true,
        created_at: now,
        updated_at: now,
      },
      // OpenAI 备选 mllm + image_gen 也加上,active: false
      // ...(对照 SPEC.md § Provider 默认 seed)
    ]
  }
  ```

- [ ] **1.4.2** 写 `src/lib/seeds/default-prompts.ts`
  ```ts
  // 默认 prompt 模板,首启动写入 AppConfig.prompts,用户可在 Settings/Prompts 改
  // 内容直接对照 SPEC.md § Pass 1 / Pass 2 prompt 模板

  export const DEFAULT_PASS1_LAYOUT = `<对照 SPEC.md § Pass 1 system message 完整复制>`
  export const DEFAULT_PASS2_EXTRACT = `<对照 SPEC.md § Pass 2 prompt 模板,含 {{element_summary}} {{element_count}} {{page_description}} 三个占位符>`
  export const DEFAULT_PASS2_VALIDATE = `<对照 SPEC.md § Pass 2 反向校验 system message>`
  export const DEFAULT_CODING_AGENT_INTRO = `<对照 PRD.md spec.md 模板的「Coding agent 指令」段>`

  // 实施提示:这 4 段长字符串建议写在独立 .txt 文件里然后用构建期 import,而不是
  // 内嵌成多行字符串(转义 backtick 容易出错)。但 Phase 1 简单先内嵌,Phase 4/5 再优化
  ```

- [ ] **1.4.3** 写 `src/lib/config.ts`(AppConfig CRUD + 首启动 seed)
  ```ts
  import path from 'node:path'
  import type { AppConfig } from '@/lib/types'
  import { DATA_ROOT, readJson, writeJson } from '@/lib/fs-utils'
  import { defaultProviders } from '@/lib/seeds/default-providers'
  import {
    DEFAULT_PASS1_LAYOUT,
    DEFAULT_PASS2_EXTRACT,
    DEFAULT_PASS2_VALIDATE,
    DEFAULT_CODING_AGENT_INTRO,
  } from '@/lib/seeds/default-prompts'

  const CONFIG_PATH = path.join(DATA_ROOT, 'config.json')
  const SCHEMA_VERSION = '0.1.0'

  function defaultConfig(): AppConfig {
    return {
      version: SCHEMA_VERSION,
      providers: defaultProviders(),
      prompts: {
        pass1_layout: DEFAULT_PASS1_LAYOUT,
        pass2_extract: DEFAULT_PASS2_EXTRACT,
        pass2_validate: DEFAULT_PASS2_VALIDATE,
        coding_agent_intro: DEFAULT_CODING_AGENT_INTRO,
      },
      settings: {
        auto_run_pass1_on_upload: true,
        auto_run_validation_after_pass2: true,
        default_export_dir: path.join(process.env.HOME ?? '~', 'img2ui-out'),
      },
    }
  }

  export async function loadConfig(): Promise<AppConfig> {
    const existing = await readJson<AppConfig>(CONFIG_PATH)
    if (existing) return existing
    // 首启动 seed
    const seed = defaultConfig()
    await writeJson(CONFIG_PATH, seed)
    return seed
  }

  export async function saveConfig(config: AppConfig): Promise<void> {
    await writeJson(CONFIG_PATH, config)
  }

  // API key mask helpers(直接抄 evalyst 模式)
  const MASK_PATTERN = /^[\w-]{1,3}\*{3,}[\w-]{1,4}$/  // sk-***xxxx 之类

  export function maskKey(raw: string): string {
    if (!raw) return ''
    if (raw.length <= 8) return '***' + raw.slice(-2)
    return raw.slice(0, 3) + '***' + raw.slice(-4)
  }

  export function isMasked(s: string): boolean {
    return MASK_PATTERN.test(s)
  }

  // GET /api/config 用:把所有 api_key 替换成 mask
  export function maskConfig(config: AppConfig): AppConfig {
    return {
      ...config,
      providers: config.providers.map((p) => ({
        ...p,
        api_key: maskKey(p.api_key),
      })),
    }
  }

  // PUT /api/config 用:遮罩字符串视为「未改动」,从磁盘读原值还原
  export async function unmaskApiKeys(incoming: AppConfig): Promise<AppConfig> {
    const onDisk = await readJson<AppConfig>(CONFIG_PATH)
    return {
      ...incoming,
      providers: incoming.providers.map((p) => {
        if (!isMasked(p.api_key)) return p  // 用户改过,采纳新值
        const original = onDisk?.providers.find((op) => op.id === p.id)
        return { ...p, api_key: original?.api_key ?? '' }
      }),
    }
  }
  ```

- [ ] **1.4.4** 单测 `src/lib/__tests__/config.test.ts`
  ```ts
  import { describe, it, expect, afterEach } from 'vitest'
  import { promises as fs } from 'node:fs'
  import { DATA_ROOT } from '../fs-utils'
  import { loadConfig, saveConfig, maskKey, isMasked, maskConfig, unmaskApiKeys } from '../config'

  afterEach(async () => {
    await fs.rm(DATA_ROOT, { recursive: true, force: true })
  })

  describe('config', () => {
    it('loadConfig seeds default on first run', async () => {
      const cfg = await loadConfig()
      expect(cfg.version).toBe('0.1.0')
      expect(cfg.providers.length).toBeGreaterThan(0)
      expect(cfg.providers.find((p) => p.kind === 'mllm')).toBeDefined()
      expect(cfg.providers.find((p) => p.kind === 'image_gen')).toBeDefined()
    })

    it('loadConfig persists between calls', async () => {
      const cfg1 = await loadConfig()
      const cfg2 = await loadConfig()
      expect(cfg1.providers[0]!.id).toBe(cfg2.providers[0]!.id)
    })

    it('maskKey + isMasked', () => {
      const masked = maskKey('sk-abcdef1234567890')
      expect(isMasked(masked)).toBe(true)
      expect(masked).toMatch(/sk-\*+\d+/)
    })

    it('unmaskApiKeys restores original key when incoming is masked', async () => {
      const cfg = await loadConfig()
      cfg.providers[0]!.api_key = 'sk-real-key-12345'
      await saveConfig(cfg)

      const masked = maskConfig(cfg)
      expect(isMasked(masked.providers[0]!.api_key)).toBe(true)

      const restored = await unmaskApiKeys(masked)
      expect(restored.providers[0]!.api_key).toBe('sk-real-key-12345')
    })

    it('unmaskApiKeys takes new value when incoming is not masked', async () => {
      const cfg = await loadConfig()
      cfg.providers[0]!.api_key = 'sk-old'
      await saveConfig(cfg)

      const updated = { ...cfg, providers: [{ ...cfg.providers[0]!, api_key: 'sk-new' }, ...cfg.providers.slice(1)] }
      const restored = await unmaskApiKeys(updated)
      expect(restored.providers[0]!.api_key).toBe('sk-new')
    })
  })
  ```

- [ ] **1.4.5** 跑测试 + commit
  ```bash
  npm test
  # Expected: 11 tests pass total
  git add src/lib package.json
  git commit -m "feat(config): AppConfig load/save + provider seed + api_key 双向 mask"
  ```

---

## Task 1.5:顶层 layout + Sidebar

**目标**:`<html>` + Sidebar(包含项目 / 设置入口),Toaster 全局,中文文案

- [ ] **1.5.1** 写 `src/components/sidebar.tsx`(Phase 1 只渲染两个静态导航,Phase 3 才会接动态项目列表)
  ```tsx
  'use client'
  import Link from 'next/link'
  import { usePathname } from 'next/navigation'
  import { Folder, Settings, Image as ImageIcon } from 'lucide-react'
  import { cn } from '@/lib/utils'

  const NAV = [
    { href: '/projects', label: '项目', icon: Folder },
    { href: '/settings', label: '设置', icon: Settings },
  ] as const

  export function Sidebar() {
    const pathname = usePathname()
    return (
      <aside className="w-52 shrink-0 border-r bg-muted/20 flex flex-col">
        <div className="px-4 py-4 border-b flex items-center gap-2">
          <ImageIcon className="size-5" />
          <span className="font-medium">img2UI</span>
        </div>
        <nav className="flex-1 p-2 space-y-1">
          {NAV.map((item) => {
            const active = pathname.startsWith(item.href)
            const Icon = item.icon
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-2 px-3 py-2 rounded-md text-sm',
                  active ? 'bg-foreground/10 font-medium' : 'hover:bg-foreground/5'
                )}
              >
                <Icon className="size-4" />
                {item.label}
              </Link>
            )
          })}
        </nav>
      </aside>
    )
  }
  ```

- [ ] **1.5.2** 改 `src/app/layout.tsx`
  ```tsx
  import type { Metadata } from 'next'
  import { Toaster } from 'sonner'
  import { Sidebar } from '@/components/sidebar'
  import './globals.css'

  export const metadata: Metadata = {
    title: 'img2UI',
    description: '把 AI 生图设计稿转成 coding agent 可消费的素材包',
  }

  export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
      <html lang="zh-CN">
        <body className="flex h-screen overflow-hidden">
          <Sidebar />
          <main className="flex-1 overflow-y-auto">{children}</main>
          <Toaster position="bottom-right" />
        </body>
      </html>
    )
  }
  ```

- [ ] **1.5.3** 写 `src/app/page.tsx`(首页 redirect 到 /projects)
  ```tsx
  import { redirect } from 'next/navigation'
  export default function Home() {
    redirect('/projects')
  }
  ```

- [ ] **1.5.4** Commit
  ```bash
  git add src/app src/components
  git commit -m "feat(ui): 顶层 layout + Sidebar 导航"
  ```

---

## Task 1.6:Placeholder 页面(Phase 2/3 真实页面之前的空态)

**目标**:`/projects` 和 `/settings` 不返回 404,展示「暂无项目 / 待 Phase 2 实施」类空态。这样 Phase 1 退出准则可以验证

- [ ] **1.6.1** 写 `src/app/projects/page.tsx`(空态)
  ```tsx
  import { Folder } from 'lucide-react'

  export default function ProjectsPage() {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
        <Folder className="size-16 mb-4 opacity-30" />
        <h1 className="text-lg font-medium mb-1">暂无项目</h1>
        <p className="text-sm">Phase 3 完成后这里会显示项目列表与「+ 新建项目」按钮</p>
      </div>
    )
  }
  ```

- [ ] **1.6.2** 写 `src/app/settings/page.tsx`(redirect 到 models 子页)
  ```tsx
  import { redirect } from 'next/navigation'
  export default function SettingsPage() {
    redirect('/settings/models')
  }
  ```

- [ ] **1.6.3** 写 `src/app/settings/layout.tsx` + `src/app/settings/models/page.tsx` + `src/app/settings/cdn/page.tsx` + `src/app/settings/prompts/page.tsx`(均空态,Phase 2 才接业务)
  ```tsx
  // src/app/settings/layout.tsx —— 子 tab 导航
  'use client'
  import Link from 'next/link'
  import { usePathname } from 'next/navigation'
  import { cn } from '@/lib/utils'

  const TABS = [
    { href: '/settings/models', label: '模型' },
    { href: '/settings/cdn', label: 'CDN' },
    { href: '/settings/prompts', label: 'Prompts' },
  ] as const

  export default function SettingsLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname()
    return (
      <div className="flex flex-col h-full">
        <div className="border-b px-6 py-4">
          <h1 className="text-xl font-semibold mb-3">设置</h1>
          <nav className="flex gap-4 text-sm">
            {TABS.map((t) => (
              <Link
                key={t.href}
                href={t.href}
                className={cn(
                  'pb-2 border-b-2 -mb-[17px]',
                  pathname.startsWith(t.href) ? 'border-foreground font-medium' : 'border-transparent text-muted-foreground hover:text-foreground'
                )}
              >
                {t.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex-1 overflow-y-auto p-6">{children}</div>
      </div>
    )
  }
  ```
  ```tsx
  // 三个子页面都返回空态:
  // src/app/settings/models/page.tsx
  export default function ModelsPage() {
    return <p className="text-sm text-muted-foreground">Phase 2 实施 Provider 配置后此处展示模型卡片</p>
  }
  // src/app/settings/cdn/page.tsx
  export default function CdnPage() {
    return <p className="text-sm text-muted-foreground">Phase 2 实施 Provider 配置后此处展示 CDN 配置</p>
  }
  // src/app/settings/prompts/page.tsx
  export default function PromptsPage() {
    return <p className="text-sm text-muted-foreground">Phase 2 实施后此处展示 Pass 1 / Pass 2 / 校验 prompt 编辑器</p>
  }
  ```

- [ ] **1.6.4** Commit
  ```bash
  git add src/app
  git commit -m "feat(ui): 项目列表 + 设置子页 placeholder 空态"
  ```

---

## Task 1.7:README + 启动脚本

**目标**:README 写明本地运行步骤,新手能跟着跑起来

- [ ] **1.7.1** 写 `README.md`(顶层,跟 PRD/SPEC/CLAUDE 同级)
  ```markdown
  # img2UI

  把 AI 生图设计稿(GPT-image-2 等输出的栅格化 PNG)转成 coding agent(Claude Code / Cursor 等)可消费的素材包。本地 web app,无独立后端。

  - 产品定位 / 用户场景:[PRD.md](./PRD.md)
  - 技术契约 / 数据 schema / API:[SPEC.md](./SPEC.md)
  - 反直觉强约束(每次进项目必读):[CLAUDE.md](./CLAUDE.md)
  - 开发流程 / 分支 / PR / commit:[AGENTS.md](./AGENTS.md)
  - 实施 plan(7 phases):[PLAN.md](./PLAN.md)
  - PoC 历史(v1-v11):[poc/EXPLORATION-HISTORY.md](./poc/EXPLORATION-HISTORY.md)

  ## 本地运行

  前提:Node.js 22+,npm 10+

  ```bash
  npm install
  npm run dev
  # 浏览器开 http://localhost:3000
  ```

  首启动会在 `data/config.json` 写入默认 provider 模板(sankuai / apimart / OpenAI 三组),需要在 `/settings/models` 填 API key 后才能用。

  ## 验证

  ```bash
  npm run typecheck   # tsc --noEmit
  npm test            # vitest run
  npm run lint
  npm run build
  ```

  ## 数据存放

  所有运行时数据在 `data/` 下(已 gitignore):

  - `data/config.json` — 全局配置(providers + prompts + settings)
  - `data/projects/` `data/pages/` `data/states/` `data/elements/` `data/assets/` — 实体 metadata
  - `data/raw/` — 用户上传的原图
  - `data/pass2/` — Pass 2 输出的绿幕 PNG
  - `data/keyed/` — chroma key 后的透明 PNG
  - `data/assets-bin/` — 切片后的单 asset PNG
  - `data/pipelines/` — pipeline run 记录(debug 用)
  ```

- [ ] **1.7.2** Commit
  ```bash
  git add README.md
  git commit -m "docs: README 起步指南"
  ```

---

## Phase 1 退出验证

- [ ] **V1**:Verification 五件套全过
  ```bash
  npm run typecheck   # ✓
  npm test            # ✓ (≥ 11 tests pass)
  npm run lint        # ✓
  npm run build       # ✓
  ```

- [ ] **V2**:`npm run dev` 起服务,浏览器开 `http://localhost:3000`,确认:
  - 自动跳到 `/projects`,看到「暂无项目」空态(不是 404)
  - Sidebar 显示 img2UI logo + 「项目」「设置」两个入口
  - 当前路径在「项目」高亮
  - 点击「设置」跳到 `/settings/models`,Sidebar 高亮切到「设置」,顶部显示「设置」标题 + 「模型 / CDN / Prompts」三 tab
  - 点击各 tab,内容区切换
  - **DevTools console 无 error / warning**
  - 关闭重开浏览器,导航状态保持(无 client-side state lost)

- [ ] **V3**:`data/config.json` 已自动生成
  ```bash
  cat data/config.json | head -20
  # 应该看到 providers 数组(3-4 个)+ prompts + settings + version: "0.1.0"
  ```

- [ ] **V4**:Self-review 看自己的 diff,逐一对照:
  - [ ] `src/lib/types.ts` 跟 [SPEC.md § 数据 schema] 完全一致(字段名 / 类型 / optional 标记)
  - [ ] `src/lib/seeds/default-providers.ts` 跟 [SPEC.md § Provider 默认 seed] 完全一致
  - [ ] 没有 dead code / stale 注释 / typo / TODO 没消化
  - [ ] commit 信息符合 [AGENTS.md § 3] 格式

- [ ] **V5**:开 PR
  ```bash
  git push -u origin feat/phase-1-bootstrap
  gh pr create --title "feat: Phase 1 项目骨架" --body "$(cat <<'EOF'
  ## Summary
  - Next.js 16 + shadcn v4 + TypeScript strict + 关键依赖
  - `src/lib/{fs-utils, id, types, run-lock, config}.ts` 五个底层模块,带单测
  - CSRF middleware
  - 顶层 layout + Sidebar + Toaster
  - `/projects` 和 `/settings/{models,cdn,prompts}` 空态页面(Phase 2/3 接业务)
  - README 起步指南

  ## Test plan
  - [ ] 五件套 verification 全过
  - [ ] 浏览器跑 V2 步骤,Sidebar / 路由 / settings tab 切换均正常
  - [ ] `data/config.json` 首启动自动生成

  🤖 Generated with [Claude Code](https://claude.com/claude-code)
  EOF
  )"
  ```

---

## Phase 1 不做的事(避免 scope 蔓延 / [AGENTS.md § 5])

明确**不**在 Phase 1 做、留到后续 phase:

- ❌ Provider Test Connection 真实接 LLM —— Phase 2
- ❌ Provider 卡片 CRUD UI —— Phase 2
- ❌ 项目 / 页面 / 状态 CRUD —— Phase 3
- ❌ 文件上传 —— Phase 3
- ❌ Pass 1 真实调用 —— Phase 4
- ❌ Element Review canvas —— Phase 4
- ❌ Pass 2 / chroma key / 切片 —— Phase 5
- ❌ Asset Review —— Phase 5
- ❌ CDN / Export —— Phase 6
- ❌ Playwright e2e —— Phase 4 引入(Phase 1 vitest 单测就够)
- ❌ knip / 其他 lint 工具 —— Phase 7
- ❌ i18n —— MVP 全期不做([CLAUDE.md § 跟 evalyst 关系])

如果实施过程中发现需要做以上任何一项,先停下,确认是 Phase 1 真的需要还是 scope 扩张。如果是后者,记录到 PR description 的 `## Plan deviation` 段([AGENTS.md § 5])。

---

## 风险点提前预警

| 风险 | 触发场景 | 缓解 |
|---|---|---|
| `create-next-app` 在已有 `*.md` 的目录下报「目录非空」 | 现有项目根有 PRD.md / SPEC.md / CLAUDE.md / AGENTS.md / PLAN.md | 安装时确认 yes 继续;之后用 `git status` 确认 markdown 没被改动 |
| shadcn v4 base-nova style 跟 Tailwind v4 兼容性 | 新版本配合可能有未知问题 | Step 1.1.4 跑完立即 `npm run dev` 看是否报错;有问题去 shadcn changelog 查 |
| `noUncheckedIndexedAccess` 让 `arr[0]` 类型变 `T \| undefined`,导致大量旧代码红线 | 数组取下标的地方都要加 `!` 或 if 判 | 接受,这是 strict 的代价。lib 模块写起来要用 `arr[0]!` 或 `if (arr[0]) ...` |
| `data/` 在 git 之外但首次 npm test 会创建`data/_test/` | 测试遗留垃圾文件 | `afterEach` 清理(已加在 1.2.5) |
| Phase 1 子 plan 跟主 PLAN.md Phase 1 outline 不同步 | 如果改主 PLAN 没改这里 | 子 plan 跟主 plan 双向引用,实施时如有冲突按子 plan 走(子 plan 是实施真理) |

---

**子 plan 版本**:v0.1 (2026-05-13)
**配套主 plan**:[PLAN.md](../../PLAN.md) Phase 1
