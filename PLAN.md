# img2UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 AI 生图设计稿(GPT-image-2 输出)转成 coding agent 可消费的素材包(透明 PNG + layout.json + spec.md)的本地 web app

**Architecture:** Next.js 16 单进程,App Router + Route Handlers,数据存 `data/*.json`,无独立后端。两条独立 pass(布局分析 + 资产提取)解耦,每步用户可 review/重跑。Provider 抽象用 `kind` discriminator 统一管理 mllm / image_gen / cdn 三类外部接口(PoC v11 验证后绿幕 chroma key 已 0 API,segmenter 类已删除)

**Tech Stack:** Next.js 16.2 / React 19 / TypeScript 6 (strict + noUncheckedIndexedAccess + exactOptionalPropertyTypes) / shadcn v4 (style: base-nova) / Tailwind v4 / sonner / base-ui / lucide-react / nanoid / sharp(图像处理) / @aws-sdk/client-s3(CDN) / vitest + Playwright

**配套文档**: [PRD.md](./PRD.md)(产品定位) · [SPEC.md](./SPEC.md)(技术契约) · [CLAUDE.md](./CLAUDE.md)(反直觉强约束) · [AGENTS.md](./AGENTS.md)(开发流程)

---

## Phase 路线图

| Phase | 目标 | 进入条件 | 退出条件 | 工作量(粗估) |
|---|---|---|---|---|
| **Phase 0**:PoC 技术验证 | ✅ **2026-05-13 完成 (v11 锁定)** | 详见 `poc/V10-PLAN.md` 与 `poc/EXPLORATION-HISTORY.md` | 详见同上 | 实际 2 天 / 11 轮 PoC |
| **Phase 1**:项目骨架 | Next.js + shadcn + 文件存储 + Sidebar + 顶层 layout + 中文文案 | Phase 0 通过 | `npm run dev` 起服务,Sidebar 显示空 Projects / Settings 入口,无 console error | 2-3 天 |
| **Phase 2**:Provider 配置 | Settings 页 3 类 provider(mllm/image_gen/cdn)CRUD + 双向 mask + Test Connection | Phase 1 完成 | 新建 / 编辑 / 测试 / 删除 一个 OpenAI mllm provider 端到端,API key 不泄漏到前端 | 3-4 天 |
| **Phase 3**:Project-Page-State CRUD + 上传 | 项目-页面 navigation,页面下上传多张状态图,触发 Pass 1 占位 | Phase 2 完成 | 创建项目→新建页面→上传 3 张状态图→自动触发 Pass 1(目前只是模拟数据)→ Pipeline 进度区显示状态 | 3-4 天 |
| **Phase 4**:Pass 1 + Element Review | 真实接 mllm,跨状态对齐,Element Review canvas(bbox 拖拽 + 叠加层 + 选中详情)+ 整批保存 | Phase 3 完成,Phase 0 PoC 验证 Pass 1 prompt 稳定 | 用真实图跑 Pass 1,在 Element Review 修正/确认所有元素,保存后状态可恢复 | 5-7 天 |
| **Phase 5**:Pass 2 + Asset Review | 真实接 image_gen,**绿幕 #00FF00 输出 + 本地 chroma green key + scipy split_elements 切片**,反向校验,Asset Review(Batch PNG 预览 + 切片 grid + 单元素重抠 + 拆分工具 / chroma 阈值调节 / edge clean) | Phase 4 完成,Phase 0 PoC v11 验证 Pass 2 prompt 稳定 | 用真实图跑 Pass 2 → chroma key → 切片,得到 N 个透明 PNG,Review 中处理少量边缘 case,产出全部为 validated 状态 | 5-7 天 |
| **Phase 6**:CDN + Export | S3 兼容 CDN 上传,Export 文件夹生成,spec.md 渲染,zip 下载 | Phase 5 完成 | Export 出文件夹,丢给 Claude Code 能直接读 spec.md 并生成贴合代码 | 3-4 天 |
| **Phase 7**:打磨 + dogfood | 端到端跑 1 个真实活动页(嘉锟提供),修关键问题,补单测,写 README | Phase 6 完成 | MVP-α 退出准则达成(参见 PRD § 上线/灰度策略) | 3-5 天 |

总预估:**24-36 天**(纯专注开发,不含等待 / 中断)

---

## File Structure(实施前规划)

```
img2UI/
├── README.md                      # 用户文档
├── package.json
├── next.config.ts
├── tsconfig.json (strict + noUncheckedIndexedAccess + exactOptionalPropertyTypes)
├── eslint.config.mjs
├── playwright.config.ts
├── vitest.config.ts
├── components.json                # shadcn config (style: base-nova)
├── PRD.md / SPEC.md / CLAUDE.md / AGENTS.md / PLAN.md   # 已有
├── data/                          # gitignored,运行时生成
├── e2e/                           # Playwright 测试
├── public/
└── src/
    ├── app/
    │   ├── layout.tsx             # 顶层:Sidebar + main + providers
    │   ├── page.tsx               # 首页(快捷:跳到 projects)
    │   ├── globals.css            # tailwind + shadcn 主题变量
    │   ├── settings/
    │   │   ├── layout.tsx
    │   │   ├── page.tsx           # redirect to /settings/models
    │   │   ├── models/page.tsx
    │   │   ├── cdn/page.tsx
    │   │   └── prompts/page.tsx
    │   ├── projects/
    │   │   ├── page.tsx           # 项目列表 + 新建
    │   │   └── [pid]/
    │   │       ├── layout.tsx     # 项目级面包屑
    │   │       ├── page.tsx       # 项目详情(页面列表)
    │   │       └── pages/[id]/
    │   │           ├── page.tsx   # 页面详情(states + pipeline)
    │   │           ├── elements/page.tsx   # Element Review
    │   │           ├── assets/page.tsx     # Asset Review
    │   │           └── export/page.tsx
    │   └── api/
    │       ├── config/route.ts
    │       ├── config/test/route.ts
    │       ├── projects/route.ts
    │       ├── projects/[id]/route.ts
    │       ├── projects/[id]/pages/route.ts
    │       ├── pages/[id]/route.ts
    │       ├── pages/[id]/states/route.ts
    │       ├── pages/[id]/elements/route.ts
    │       ├── pages/[id]/upload-all-assets/route.ts
    │       ├── pages/[id]/export/route.ts
    │       ├── states/[id]/route.ts
    │       ├── states/[id]/pass1/route.ts
    │       ├── states/[id]/pass2/route.ts
    │       ├── states/[id]/validate/route.ts
    │       ├── elements/[id]/re-extract/route.ts
    │       ├── assets/[id]/upload/route.ts
    │       └── pipeline-runs/[id]/route.ts
    ├── middleware.ts              # CSRF gate
    ├── components/
    │   ├── ui/                    # shadcn components
    │   ├── sidebar.tsx
    │   ├── sticky-save-bar.tsx
    │   ├── confirm-dialog.tsx
    │   ├── settings/
    │   │   ├── provider-card.tsx           # 通用 provider 卡(按 kind 切字段)
    │   │   └── prompt-editor.tsx
    │   ├── pipeline/
    │   │   └── pipeline-stepper.tsx
    │   ├── upload/
    │   │   └── states-uploader.tsx
    │   ├── element-review/
    │   │   ├── canvas.tsx                  # bbox 叠加 + 拖拽
    │   │   ├── element-list.tsx
    │   │   └── element-detail-panel.tsx
    │   └── asset-review/
    │       ├── batch-png-viewer.tsx
    │       ├── assets-grid.tsx
    │       └── asset-detail-panel.tsx
    ├── lib/
    │   ├── fs-utils.ts            # writeAtomic
    │   ├── run-lock.ts            # 同 state 互斥锁
    │   ├── id.ts                  # nanoid wrappers
    │   ├── config.ts              # AppConfig CRUD + maskKey/unmaskApiKeys
    │   ├── llm-client.ts          # OpenAI/Anthropic dispatch + retry/timeout
    │   ├── image-gen-client.ts    # GPT-image-2 image-edit 封装
    │   ├── cdn-client.ts          # S3 兼容上传
    │   ├── projects.ts            # CRUD + cascade delete
    │   ├── pages.ts
    │   ├── states.ts
    │   ├── elements.ts
    │   ├── assets.ts
    │   ├── pipelines.ts           # PipelineRun CRUD
    │   ├── pipeline-runner.ts     # Pass 1 / Pass 2 / validate orchestration
    │   ├── slicer.ts              # connected component 切片
    │   ├── alpha-clean.ts         # 边缘清理工具
    │   ├── image-utils.ts         # sharp 封装(resize, encode, alpha 检测)
    │   ├── exporter.ts            # 生成 Export 文件夹 / zip
    │   ├── prompts/               # Pass 1/2/validate prompt 模板
    │   │   ├── pass1.ts
    │   │   ├── pass2.ts
    │   │   └── validate.ts
    │   ├── seeds/                 # 种子 prompt 模板,首启动写入 config.json
    │   │   └── default-prompts.ts
    │   └── types.ts               # 全局 TypeScript 类型
    └── __tests__/                 # 单测,跟源码同目录或集中放
```

---

## Phase 0:PoC 技术验证 ✅ 已完成 (v11 锁定 — 2026-05-13)

**结果摘要:** 11 轮 PoC 迭代,架构在 v11 锁定。详见 [`poc/V10-PLAN.md`](./poc/V10-PLAN.md)(短摘要)+ [`poc/EXPLORATION-HISTORY.md`](./poc/EXPLORATION-HISTORY.md)(完整历史)

**最终架构(v11 锁定):**

```
[原图 1-N 张]
   ↓
[Pass 1: sankuai/gemini-3.1-pro-preview, temperature=1]
  - api_format='sankuai',auth header 不带 Bearer
  - 二分类 static/code,bbox 归一化 0-1,description 中文(同时是 Pass 2 prompt 渲染源)
  - CJK 100% 准确(gpt-4o 多处误读)
  - ~50s,$~0.02
   ↓
[用户 Element Review]
   ↓
[Pass 2: apimart/gpt-image-2-official, quality=high, resolution=1k, size=1:1]
  - api_format='apimart',async task polling(initial 12s + 5s/次)
  - prompt 会话式自然中文 + 绿幕 #00FF00 背景 + 自然语言数量明示清单
  - 11/11 元素全画到,CJK 完美保留,风格高保真
  - ~3min,$0.17
   ↓
[本地 chroma green key (lib/alpha-key.ts)]
  - g_excess = G - max(R, B);> 60 全透 / < 25 全不透 / ramp + spill suppression
  - 0 API,~1s
  - 76.7% 透明 / 23.2% 不透明 / 0.2% 半透
  - 元素内部白色 / 浅色 / 半透 / 玻璃质感全部保留(判别色是绿色,不抠穿)
   ↓
[scipy ndimage 切片 (lib/slicer.ts,移植自 ref/split_elements.py)]
  - binary_dilation(iter=15) 桥接同元素内部小断裂 + connected component
  - min_size=30 + min_opaque_pct=1% 二级过滤(剔除噪点)
  - 11/11 元素一一对应,无碎片化无融合
   ↓
[用户 Asset Review → CDN 上传 → Export]
```

**v1-v10 → v11 演化(可作为反面案例,记录在 CLAUDE.md 反直觉强约束):**

| 维度 | 早期(错的) | v11(对的) |
|---|---|---|
| Pass 2 通道 | backup `gpt-image-2`(v1-v7) | **`gpt-image-2-official`** + `quality:high`(backup 字形漂移) |
| Pass 2 prompt 措辞 | hard rules / TRUST SOURCE / pixel-faithfully(v2) | **会话式自然中文**(激进措辞触发模型 regenerate) |
| Pass 2 prompt 字段 | entity_name / bbox / JSON(v1/v3) | **删,只用 description 渲染 element_summary** |
| Pass 2 背景 | transparent(v7-v10) → 白底(v8-v10) | **绿幕 #00FF00**(transparent 漏画;白底抠穿元素白色) |
| 抠图判别色 | 白色(v6-v10) | **绿色 #00FF00**(白色抠穿 chip 白底 / 娃娃白发,**结构性死路**) |
| 抠图依赖 | white-threshold + segmenter v1 fallback | **本地 chroma green key,0 API,无 fallback**(segmenter kind 已删除) |
| 切片算法 | PIL 矩形 crop(v6-v9) → BFS(v3-v9) | **scipy `binary_dilation` + `ndimage.label`**(矩形 crop 异形元素留空隙;BFS 不能桥接断裂) |
| 元素覆盖完整性 | Pass 2 偶尔漏画(v9-v10) | **prompt 末尾自然语言数量明示**「共 N 个,记得每个都画到」 |

**关键产物(Phase 4/5 实施时直接复用):**
- `poc/inputs/canonical-512.png` — 测试图(奶茶盲盒抽中页)
- `poc/prompts/pass1-system-v9b.txt` — Pass 1 prompt(归一化 bbox 强化版)
- **`outputs/v11-green.png`** — Pass 2 终版输出范例(绿幕 + 11 元素)
- **`outputs/v11-keyed.png`** — chroma key 后透明 PNG 范例
- **`outputs/v11-elements/element_001..011.png`** — 11 块完美切片范例
- `ref/split_elements.py` — scipy 切片 reference impl(直接移植到 `src/lib/slicer.ts`)
- `outputs/v9b-pass1.json` — Pass 1 输出范例(36 元素,归一化 bbox)

**对后续 Phase 影响(已同步到 PRD/SPEC/CLAUDE):**
1. CLAUDE.md 反直觉强约束 §6 §7 重写(绿幕 chroma key + 数量明示 + 否决 white-threshold + 删 segmenter fallback)
2. SPEC.md Pass 2 prompt 模板重写(`element_summary` 渲染规则 + 自然语言数量明示)
3. SPEC.md 抠图章节 `whiteThresholdKey → chromaGreenKey`,加 spill suppression
4. SPEC.md 切片章节 BFS → scipy ndimage,加 `min_opaque_pct: 1%` 二级过滤
5. SPEC.md `ProviderKind` 删 `'segmenter'`,`Element` 删 `extraction_prompt` 字段(用 `description` 渲染)
6. SPEC.md Default seed 模型名 `gpt-image-2 → gpt-image-2-official`,加 `default_quality: 'high'`
7. PRD.md MVP-α 阶段描述同步,Asset Review 加「Edge clean」「Adjust chroma threshold」按钮

---

## Phase 1:项目骨架

**目的:** 把 Next.js + shadcn + 文件存储 + Sidebar + 顶层 layout 搭好,跑得动

**实施级子 plan**:[`docs/plans/phase-1-bootstrap.md`](./docs/plans/phase-1-bootstrap.md)(完整 checkbox / 代码片段 / 验证步骤 / 风险预警,**实施时按子 plan 走**)

**Files:** 见上文 File Structure,Phase 1 重点是 `src/app/layout.tsx` / `src/app/page.tsx` / `src/components/sidebar.tsx` / `src/middleware.ts` / `src/lib/{fs-utils, id, types, run-lock, config}.ts` / shadcn 初始化

### Task 1.1:Next.js + TypeScript + shadcn 初始化

- [ ] **Step 1: `npx create-next-app@latest`**

```bash
cd /Users/lijiakun/Documents/img2UI
npx create-next-app@latest . \
  --typescript --tailwind --app --no-src-dir --import-alias "@/*" \
  --eslint --use-npm
# 选 src/ directory: Yes,移除上面的 --no-src-dir
```

实际命令 yes 选项:`--src-dir`(把代码放 src/)

- [ ] **Step 2: 升级 TypeScript 配置**

`tsconfig.json` 加上:

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

- [ ] **Step 3: 安装 shadcn**

```bash
npx shadcn@latest init -d -s base-nova -c neutral
npx shadcn@latest add button input label card badge dialog tabs select slider separator checkbox progress sonner textarea
```

- [ ] **Step 4: 安装运行时依赖**

```bash
npm install nanoid sharp lucide-react @aws-sdk/client-s3 openai
npm install --save-dev vitest @types/node
```

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "chore: 初始化 Next.js 16 + shadcn v4 + 关键依赖"
```

### Task 1.2:核心 lib 模块——`fs-utils` / `id` / `types`

- [ ] **Step 1: 写 `src/lib/fs-utils.ts`**

```ts
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { nanoid } from 'nanoid'

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

export const DATA_ROOT = path.join(process.cwd(), 'data')
```

- [ ] **Step 2: 写 `src/lib/id.ts`**

```ts
import { customAlphabet } from 'nanoid'

const alpha = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
export const nid6 = customAlphabet(alpha, 6)
export const nid8 = customAlphabet(alpha, 8)
export const nid12 = customAlphabet(alpha, 12)

export const newProviderId = () => `prv_${nid6()}`
export const newProjectId = () => `proj_${nid8()}`
export const newPageId = () => `page_${nid8()}`
export const newStateId = () => `state_${nid8()}`
export const newElementId = () => `el_${nid8()}`
export const newAssetId = () => `asset_${nid8()}`
export const newRunId = () => `run_${nid8()}`
```

- [ ] **Step 3: 写 `src/lib/types.ts`**

把 SPEC.md § 数据 schema 中的所有 TypeScript 类型导出。略——见 [SPEC.md](./SPEC.md)。**重要:必须跟 SPEC 完全一致,文档同步规则见 [AGENTS.md § 8]**

- [ ] **Step 4: 写最小单测 `src/lib/__tests__/fs-utils.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { writeAtomic, readJson, writeJson, DATA_ROOT } from '../fs-utils'
import path from 'node:path'
import { promises as fs } from 'node:fs'

describe('fs-utils', () => {
  it('writeJson + readJson roundtrip', async () => {
    const tmp = path.join(DATA_ROOT, '_test', 'roundtrip.json')
    await writeJson(tmp, { hello: 'world' })
    const back = await readJson<{ hello: string }>(tmp)
    expect(back?.hello).toBe('world')
    await fs.rm(path.dirname(tmp), { recursive: true })
  })

  it('readJson returns null on missing file', async () => {
    const back = await readJson(path.join(DATA_ROOT, '_test', 'nope.json'))
    expect(back).toBeNull()
  })
})
```

- [ ] **Step 5: 配置 vitest**

写 `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'
export default defineConfig({
  test: {
    include: ['src/**/__tests__/**/*.test.ts'],
    environment: 'node',
  },
})
```

加 `package.json` script: `"test": "vitest run"`

- [ ] **Step 6: 跑测试 + commit**

```bash
npm test
# Expected: 2 tests pass

git add .
git commit -m "feat(lib): fs-utils + id + types 基础模块"
```

### Task 1.3:CSRF middleware

- [ ] **Step 1: 写 `src/middleware.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server'

export function middleware(req: NextRequest) {
  // 只对 /api/* 应用 CSRF gate
  if (!req.nextUrl.pathname.startsWith('/api/')) return NextResponse.next()
  // GET / HEAD 是安全的
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return NextResponse.next()
  // 检查 Sec-Fetch-Site:same-origin / same-site / none(直接打开)允许;cross-site 拒绝
  const site = req.headers.get('sec-fetch-site')
  if (site === 'cross-site') {
    return new NextResponse('CSRF blocked', { status: 403 })
  }
  return NextResponse.next()
}

export const config = { matcher: '/api/:path*' }
```

- [ ] **Step 2: Commit**

```bash
git add src/middleware.ts
git commit -m "feat(security): CSRF gate via Sec-Fetch-Site,localhost-only"
```

### Task 1.4:顶层 layout + Sidebar

- [ ] **Step 1: 写 `src/components/sidebar.tsx`**

```tsx
'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Folder, Settings, Image as ImageIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

const NAV = [
  { href: '/projects', label: '项目', icon: Folder },
  { href: '/settings', label: '设置', icon: Settings },
]

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

- [ ] **Step 2: 改 `src/app/layout.tsx`**

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

- [ ] **Step 3: 写 `src/app/page.tsx`(首页 redirect)**

```tsx
import { redirect } from 'next/navigation'
export default function Home() {
  redirect('/projects')
}
```

- [ ] **Step 4: 起服务验证**

```bash
npm run dev
# 浏览器开 localhost:3000
# 应该自动跳到 /projects(虽然是 404 因为还没建)
# Sidebar 应该显示「项目」「设置」两个 link
# 没有 console error
```

- [ ] **Step 5: Commit**

```bash
git add src/app src/components
git commit -m "feat(ui): 顶层 layout + Sidebar 导航"
```

**Phase 1 退出准则:** `npm run dev` 起服务,浏览器看到 Sidebar 渲染正确,layout 正常。`npm test` 通过

---

## Phase 2:Provider 配置(任务级 outline,执行时再展开)

**目的:** Settings 页能 CRUD 3 类 provider(mllm / image_gen / cdn),Test Connection 工作,API key 双向 mask

**实施级子 plan**:[`docs/plans/phase-2-provider-config.md`](./docs/plans/phase-2-provider-config.md)(Task 2.1-2.9 完整 checkbox / 代码片段 / 验证步骤,**实施时按子 plan 走**)

**Files to create/modify:**

```
src/app/settings/{layout,page}.tsx
src/app/settings/{models,cdn,prompts}/page.tsx
src/app/api/config/route.ts
src/app/api/config/test/route.ts
src/lib/config.ts                # AppConfig CRUD + maskKey/unmaskApiKeys
src/lib/llm-client.ts             # OpenAI/Anthropic dispatch + retry
src/lib/cdn-client.ts             # S3 兼容 head 测试
src/components/settings/provider-card.tsx
src/components/settings/prompt-editor.tsx
src/components/sticky-save-bar.tsx (从 evalyst 抄)
src/components/confirm-dialog.tsx (从 evalyst 抄)
src/lib/seeds/default-prompts.ts  # 首启动写入的 Pass 1/2 默认 prompt
```

**关键任务:**

1. **从 evalyst 复制 `lib/llm-config.ts` 模式**:`maskKey` 函数(`sk-***xxxx`)、`unmaskApiKeys` 函数(从磁盘还原)、`writeAtomic` 持久化到 `data/config.json`
2. **改造 ProviderConfig 加 `kind` discriminator**:用 TypeScript discriminated union,UI 按 kind 分组渲染卡片,字段按 kind 切换显示
3. **`provider-card.tsx` 是通用卡片**,内部根据 props.kind 决定渲染哪些字段。Test Connection 按钮按 kind 调不同 endpoint:
   - `mllm`:发 5-token ping(OpenAI / sankuai)或最小 messages(Anthropic)
   - `image_gen`:apimart sync 提交一张 16x16 单像素生成 task,等 completed 即可(不需要下载,确认链路通就行);OpenAI 直连用最小 generations 请求
   - `cdn`:HEAD bucket 检查权限
4. **首启动 seed**:`data/config.json` 不存在时,写入默认 prompts(从 `src/lib/seeds/default-prompts.ts`),providers 数组为空
5. **API 路由**:`GET /api/config` 调 `maskKey` 后返回;`PUT /api/config` 检测 mask 字符串、调 `unmaskApiKeys` 后写盘;`POST /api/config/test` 按 provider id 取真实 key,发测试请求,**不返回真实 key**

**验证:**
- 单测:`maskKey('sk-abcdef1234567890')` → `'sk-***7890'`
- 单测:`unmaskApiKeys` 在 mask 字符串时从磁盘还原,在新值时直接采纳
- E2E:新建 OpenAI mllm provider,Test Connection 通过,关闭浏览器重开能看到 provider 仍在(且 key 是遮罩的)

**预估:** 3-4 天。**完成后写一份子 plan `docs/plans/phase-2-providers.md` 详细到任务级**(执行 Phase 2 前展开)

---

## Phase 3:Project / Page / State CRUD + 上传

**实施级子 plan**:[`docs/plans/phase-3-projects-pages-states.md`](./docs/plans/phase-3-projects-pages-states.md)(Task 3.1-3.7 完整 checkbox / 代码片段 / 验证步骤,**实施时按子 plan 走**)

**目的:** 项目-页面 navigation,页面下能上传多张状态图,触发 Pass 1 占位(返回模拟数据)

**Files to create:**

```
src/app/projects/page.tsx
src/app/projects/[pid]/{layout,page}.tsx
src/app/projects/[pid]/pages/[id]/page.tsx
src/app/api/projects/route.ts
src/app/api/projects/[id]/route.ts
src/app/api/projects/[id]/pages/route.ts
src/app/api/pages/[id]/route.ts
src/app/api/pages/[id]/states/route.ts
src/app/api/states/[id]/route.ts
src/app/api/states/[id]/pass1/route.ts        # 占位返回 mock
src/lib/projects.ts
src/lib/pages.ts
src/lib/states.ts
src/lib/pipelines.ts
src/lib/run-lock.ts
src/components/upload/states-uploader.tsx
src/components/pipeline/pipeline-stepper.tsx
```

**关键任务:**

1. **CRUD 模式统一**:`lib/projects.ts` 等都用同一个 pattern——`list / get / create / update / delete`,持久化路径是 `data/projects/{id}.json`(单文件一项目),delete 时级联清理 `pages/`、`states/`、`elements/`、`assets/` 等
2. **States 上传**:`POST /api/pages/[id]/states` 接 multipart,sharp 读图获取 width/height,写到 `data/raw/{state-id}.png`,生成 State JSON。同时返回缩略图(用 sharp 生成 256px webp)
3. **`pipeline-stepper.tsx`**:6 步可视化组件,接受 `state.pipeline_status`,渲染 ✓ ⏳ ⚪ ✗
4. **Pass 1 占位**:`POST /api/states/[id]/pass1` 起一个异步任务,5 秒后写入 mock element 数据(2 个 static + 1 个 code),期间状态机 idle → pass1_running → pass1_done
5. **Run lock**:`run-lock.ts` 是内存 Map<state_id, run_id>,Pass 1/2/re-extract 互斥

**验证:**
- 端到端:创建项目 → 进入项目 → 新建页面 → 上传 3 张状态图 → 看到 States 区有 3 个卡 → 自动触发 Pass 1 → 5 秒后 Pipeline 进度区 stepper 推进到「布局分析 ✓ 完成」

**预估:** 3-4 天。**完成后写子 plan `docs/plans/phase-3-crud.md`**

---

## Phase 4:真实 Pass 1 + Element Review

**实施级子 plan**:[`docs/plans/phase-4-pass1-element-review.md`](./docs/plans/phase-4-pass1-element-review.md)(Task 4.1-4.6 完整 checkbox / 代码片段 / 验证步骤)

**目的:** 真实接 mllm 跑布局分析,跨状态对齐,Element Review canvas 全功能(bbox 拖拽、空白拖创建、叠加层 toggle、详情面板编辑)

**Files to create:**

```
src/lib/llm-client.ts              # 增强:支持 vision input,3 次 retry,120s 超时
src/lib/pipeline-runner.ts         # Pass 1 实现
src/lib/elements.ts                # Element CRUD + 跨状态对齐
src/lib/prompts/pass1.ts           # Pass 1 prompt 模板
src/app/api/states/[id]/pass1/route.ts   # 替换 Phase 3 的 mock,调用 pipeline-runner
src/app/api/pages/[id]/elements/route.ts
src/app/projects/[pid]/pages/[id]/elements/page.tsx
src/components/element-review/canvas.tsx
src/components/element-review/element-list.tsx
src/components/element-review/element-detail-panel.tsx
```

**关键任务:**

1. **`pipeline-runner.ts` 的 Pass 1 实现**:
   - 读 state(s) 的原图
   - 渲染 Pass 1 prompt 模板(注入 page_name / state_count / images base64)
   - 调 `llm-client.callMllm()`(支持 image_url / base64 input,response_format json_object,temperature=0)
   - 解析返回 JSON,跨状态对齐(同 entity_name → 同 element.id),写入 `data/elements/{page-id}.json`
   - 更新 PipelineRun 状态为 completed
   - 错误处理:retry 3 次,超时 120s,error 写入 PipelineRun.error
2. **`canvas.tsx` 是核心**:
   - 用 `<canvas>` 或 SVG 叠加层(推荐 SVG,因为有交互);原图作背景 `<img>`
   - 每个元素一个 `<g>` 包含 bbox `<rect>`+ 元素 name 标签
   - bbox 上 8 个角/边点 `<circle>` 用作 resize handle
   - 全图绑定 mouse 事件:
     - mousedown on bbox → 进入 drag mode
     - mousedown on handle → 进入 resize mode
     - mousedown on empty area → 开始绘制新 bbox
   - 选中态、hover 态、modify mode 用 CSS variable 切换
3. **`element-detail-panel.tsx`**:根据 type 切换显示字段(static 只显示 description / code 显示 shape_spec + material_spec)。textarea 用 `react-textarea-autosize` 或自然 resize。**注意**:type=static 时 description 直接进 Pass 2 prompt 渲染,UI 上显示提示「这段描述会用于资产提取,描述越具体效果越好」
4. **跨状态对齐 UI**:在 element row 显示 `Cross-state: [canonical, hover]` chip,点击展开详情看每个 state 的 bbox 差异

**验证:**
- 用 Phase 0 的真实奶茶盲盒图跑端到端
- Element Review canvas 上能拖拽改 bbox、空白拉新元素
- 保存后 reload 状态可恢复
- type 切换从 static → code,description 字段保留(始终显示),shape_spec / material_spec 字段显示

**预估:** 5-7 天。**写子 plan `docs/plans/phase-4-pass1-element-review.md`**

---

## Phase 5:真实 Pass 2 + Asset Review

**目的:** 真实接 image_gen 跑资产提取(绿幕 chroma key 路径),scipy 切片,反向校验,Asset Review 全功能

**Files to create:**

```
src/lib/image-gen-client.ts         # gpt-image-2-official image-edit 封装(apimart async pattern)
src/lib/alpha-key.ts                # chroma green key(0 API)
src/lib/slicer.ts                   # scipy binary_dilation + connected component 切片(移植 ref/split_elements.py)
src/lib/image-utils.ts              # sharp 封装:resize, alpha 检测, edge map
src/lib/assets.ts                   # Asset CRUD
src/lib/prompts/render-element-summary.ts  # Pass 2 element_summary 渲染(数量明示)
src/lib/prompts/{pass2,validate}.ts # Pass 2 + 校验 prompt 模板
src/app/api/states/[id]/pass2/route.ts
src/app/api/states/[id]/validate/route.ts
src/app/api/elements/[id]/re-extract/route.ts
src/app/projects/[pid]/pages/[id]/assets/page.tsx
src/components/asset-review/batch-png-viewer.tsx       # 支持切换看绿幕原图 / chroma key 后透明 PNG
src/components/asset-review/assets-grid.tsx
src/components/asset-review/asset-detail-panel.tsx
src/components/asset-review/edge-clean-tool.tsx        # 局部 spill suppression / alpha 微调
src/components/asset-review/chroma-threshold-slider.tsx # 调 chroma key 25/60 阈值,本地实时预览
src/components/asset-review/split-fragment-tool.tsx    # 拆分误融合的连通块
```

**关键任务:**

1. **`image-gen-client.ts`**:封装 apimart `/v1/images/generations` async pattern:submit → poll(initial 12s + interval 5s,最多 24 次)→ download(必须带浏览器 UA,否则 S3 403)。`quality` 参数透传(provider 默认 `'high'`)。OpenAI 直连备选用 sync 路径
2. **`render-element-summary.ts`**(SPEC.md § Pass 2 prompt 模板规定):取 type=static 元素,按 name 分组(完全相同 name 归一组),单数渲染 `- {name}({特征})`,复数渲染 `- {name} 共 {count} 个({聚合差异点,如不同文字})`。返回 `{ text, count }`
3. **`pipeline-runner.ts` Pass 2 实现**(基于 PoC v11):
   - 读 canonical state 原图 + 该 page 所有 type=static element
   - 调 `render-element-summary` 渲染 `{{element_summary}}` 和 `{{element_count}}`
   - 用 SPEC § Pass 2 prompt 模板拼出 prompt(会话式 + 绿幕 #00FF00 + 数量明示 + 间距要求)
   - 调 `image-gen-client`,得到绿幕 PNG → 写到 `data/pass2/{state-id}.png`
   - 调 `lib/alpha-key.ts` 做 chroma green key → 写到 `data/keyed/{state-id}.png`
   - 调 `slicer.ts` 做 scipy 切片,产出 N 个 bbox + 切片 → 写到 `data/assets-bin/{asset-id}.png`
   - 触发反向校验
4. **`alpha-key.ts`**(PoC v11 验证过的算法):`g_excess = G - max(R, B)`,> 60 全透 / < 25 全不透 / 中间 ramp。Spill suppression:`G_new = G - max(0, g_excess) for α>0`。提供 UI slider 让用户调阈值
5. **`slicer.ts`**:移植 `ref/split_elements.py`。binary_dilation iter=15(默认),connected component。min_size=30 + 二级过滤 `min_opaque_pct=1%`(剔除半透残留噪点)。worker 线程跑(避免阻塞 Next.js)。排序 (y_center, x_center)
6. **元素到切片的映射**:MVP 用「按位置顺序对应 + 用户手动调整」。Asset Review grid 上每个切片显示「对应 element」下拉,用户可改;支持「拆分一块为多个 asset」(碎块合并的 case 在 v11 不再出现,因为异形 frame 是 type=code 不进 Pass 2,所以**不需要合并工具**)
7. **重抠**:`POST /api/elements/[id]/re-extract`:用单元素 element_summary(只渲染该元素)+ 原图调 image-edit,产新绿幕 PNG → chroma key + 切片 → 替换该 asset。新 Pass 2 PNG 写到 `data/pass2/{state-id}-element-{id}.png` 留底
8. **校验展示**:Asset 卡片状态 icon 来自 `alpha_quality` 阈值 + `complete` flag

**验证:**
- 端到端:Pass 1 完成 → Run Pass 2 → 等待 60-180 秒 → Asset Review 显示绿幕 batch PNG + chroma 后 PNG + N 个切片
- 至少 70% 的 asset 直接 ✓ 通过校验(v11 实测 11/11 通过,但是测试图,真实复杂页可能更低)
- 单元素重抠:对一个有 ⚠ 警告的 asset 改 description → 点 `Re-extract`,~3 分钟后看到该 asset 被替换,状态 → ✓
- chroma threshold slider 调节后,batch PNG 预览实时更新

**预估:** 5-7 天。**写子 plan `docs/plans/phase-5-pass2-asset-review.md`**

---

## Phase 6:CDN 上传 + Export

**目的:** S3 兼容 CDN 批量/单个上传,Export 文件夹生成,spec.md 渲染

**Files to create:**

```
src/lib/cdn-client.ts               # S3 PutObject + URL 生成
src/lib/exporter.ts                 # 生成 Export 文件夹 / zip
src/app/api/assets/[id]/upload/route.ts
src/app/api/pages/[id]/upload-all-assets/route.ts
src/app/api/pages/[id]/export/route.ts
src/app/projects/[pid]/pages/[id]/export/page.tsx
```

**关键任务:**

1. **`cdn-client.ts`**:用 @aws-sdk/client-s3,签名 PutObject。文件名规则 `{public_url_prefix}/{project-id}/{page-id}/{asset-id}.png`
2. **批量上传**:串行(避免 rate limit),进度通过 SSE 或轮询返回。失败的单个不影响其他
3. **Export 文件夹生成**:按 [SPEC.md § Export 文件结构] 创建。spec.md 用模板字符串拼接(不引入 nunjucks 这种模板引擎,YAGNI)
4. **zip 生成**:用 archiver 或 tar-stream,流式输出避免一次读全
5. **Export UI**:tree 渲染用文本拼接(不用 react-treeview 这种库),`Open folder` 在 macOS 上调 `child_process.exec('open <path>')`

**验证:**
- 上传 8 个 asset 到真实 S3 bucket,所有 cdn_url 写入 manifest.json
- Export 生成 `~/img2ui-out/{project-name}/`,目录结构跟 SPEC 一致
- 把这个文件夹丢给 Claude Code,问「读 spec.md 然后实现这个页面」,Claude Code 能成功读懂并产出代码

**预估:** 3-4 天

---

## Phase 7:打磨 + dogfood

**目的:** MVP-α 退出准则达成

**关键任务:**

1. **端到端跑通真实活动页**(嘉锟自己挑一个):3 个状态、~30 元素,从上传到 Export 全流程
2. **关键问题修复**:Phase 4-6 跑 dogfood 时记下来的所有 bug
3. **错误态完善**:网络错误 / API key 失效 / CDN 配置错 / 磁盘满 等场景的友好提示(不阻断,提供修复路径)
4. **README**:用户文档,包含安装、首次配置、第一次运行的引导
5. **基础单测覆盖**:`fs-utils` / `id` / `slicer` / `maskKey` / `pipeline-runner`(用 mock LLM)
6. **E2E**:Playwright 跑 1 个端到端场景(用 mock LLM)

**验证:**
- 嘉锟独立用 img2UI 转换一个真实活动页,产出 coding agent 用 1 小时内能跑通的代码
- 全部测试通过,无 console error/warning
- README 让一个新工程师 30 分钟内能装好 + 跑出第一个 Export

**预估:** 3-5 天

---

## 跨 Phase 通用规则

1. **每个 Phase 完成后打 tag**:`v0.0.X` X 递增,CHANGELOG 在 `[Unreleased]` 记录,tag 时合并到正式版本号
2. **每个 Phase 第一个 commit 之前更新文档**:如果实施过程发现 PRD/SPEC 错漏,先改文档再写代码,**不允许**先写代码后补文档
3. **Phase 4 / 5 的 LLM prompt 修改必须伴随 PoC 重跑**(用 `data/raw/` 真实图),不允许盲改
4. **Phase 2-6 进入前先展开为子 plan**(`docs/plans/phase-N-*.md`),细化到任务级。本 PLAN.md 只是路线图

---

## Self-Review

**Spec coverage 检查:**

| SPEC / PRD 内容 | Phase 覆盖 |
|---|---|
| Provider CRUD + 4 kind | Phase 2 ✓ |
| API key 双向 mask | Phase 2 ✓ |
| Project / Page / State CRUD | Phase 3 ✓ |
| 状态图上传 + 缩略图 | Phase 3 ✓ |
| Pass 1 跨状态对齐 | Phase 4 ✓ |
| Element Review canvas + 拖拽 | Phase 4 ✓ |
| Pass 2 image-edit 提取 | Phase 5 ✓ |
| 切片算法 + 边界 case | Phase 0 PoC + Phase 5 ✓ |
| 反向校验 | Phase 5 ✓ |
| 单元素重抠 | Phase 5 ✓ |
| CDN 批量上传 + 单个重试 | Phase 6 ✓ |
| Export 文件夹 + spec.md | Phase 6 ✓ |
| 错误重试语义 | 每个 phase 内 |
| 跨状态资产对齐 | Phase 4 ✓ |
| 异形容器 = code 类型 | Phase 0 PoC + Phase 4 prompt ✓ |
| MVP-α 退出准则 | Phase 7 ✓ |

无明显 gap

**已知偏离 writing-plans skill 的部分:**
- Phase 2-7 没有展开成 step-by-step TDD 任务,只有 outline。**理由**:本 plan 是路线图,每个 Phase 进入前再展开成单独 sub-plan(`docs/plans/phase-N-*.md`)。完整 step-by-step 写在 PLAN.md 会膨胀到 300+ 任务,不可读不可维护
- Phase 0 / 1 写到 step 级,作为模板示范

---

**PLAN 版本**: v0.1 (2026-05-12)
**对应文档**: PRD.md v0.1 / SPEC.md v0.1
