# Pass 1/Pass 2 多路并行 + 拖框生效化 设计文档

> **STATUS: APPROVED — PoC v12 通过 ✅**
> 嘉锟 2026-05-14 拍板按 B 路实现。
>
> PoC 报告:[`poc/v12-multi-route/REPORT.md`](../../../poc/v12-multi-route/REPORT.md)
> - PoC #1 多参考图行为:**通过**(B 路完胜 A,模型按 crop 复刻无 regenerate)
> - PoC #2 Pass 1 5 路单类质量:**条件通过**(static 召回 77%,需修 prompt 头)
> - PoC #3 端到端 sanity:跳过(PoC #1+2 已足够支撑实施决策)
>
> 关联 PR10(`fix/dogfood-ui-polish`):并行不冲突,但建议 PR10 merge 后再开本方案分支以减少 rebase 噪音。

## 0. 背景与目标

**dogfood 暴露的四个问题(2026-05-14)**:

| # | 问题 | 根因 | 严重度 |
|---|---|---|---|
| 1 | Pass 1 / Pass 2 都是 1-shot,识别 + 生图不准 | LLM 一次性处理 15-30 个元素,模型注意力被稀释 | P0 |
| 2 | 项目/页面列表无缩略图,看名字找不到要的页 | UI 没传图,后端没存 thumbnail | P1 |
| 3 | 本地 chroma key 性能担忧 | 1024×1024 JS for 循环 ~1s,N 路并行后 N× | P2 |
| 4 | 用户在 Element Review 拖框,但 bbox 不进 Pass 2 prompt,完全无效 | `pass2-runner.ts:176` `renderElementSummary` 只读 `name`+`description`,设计上 Pass 1/Pass 2 解耦 | P0 |

**共识根因**:#1 和 #4 是同一件事——用户对 Pass 2 产出**不可控**。本方案用一套机制同时解掉这两个。#2 和 #3 是独立子项。

**目标**(分阶段):
- α: Pass 1+2 都按 5 类视觉类别并行调用,bbox crop 进 Pass 2 当多参考图。拖框间接生效。
- β: 列表缩略图。独立子项。
- γ: chroma key 不优化,只补 progress UI。

**非目标**:
- 不引入抠图 API(违反 [CLAUDE.md §7](../../../CLAUDE.md))
- 不引入 type 第三类(仍然 `static` / `code` 二分类,新增的 `visual_category` 是正交维度,见 §3)
- 不动 v11 已锁定的绿幕 #00FF00 + chroma key 算法

## 1. 整体架构

```
[原图(s) + page metadata]
     │
     ▼
┌──────────────────────────────────────────────────────────────┐
│ Pass 1: 5 路并行 mllm                                        │
│  ├─ 路1: only-Background prompt → element[]                  │
│  ├─ 路2: only-Container  prompt → element[]                  │
│  ├─ 路3: only-Button     prompt → element[]                  │
│  ├─ 路4: only-Decoration prompt → element[]                  │
│  └─ 路5: only-Subject    prompt → element[]                  │
│                                                              │
│ 合并(bbox IoU > 0.5 视为同一物理元素):                      │
│   - 同元素跨路出现 → 按优先级保留 visual_category            │
│     Subject > Button > Container > Background > Decoration   │
│   - entity_name / description 取 priority 最高那路           │
│   - 全部命中路记录到 element.pass1_routes_seen[](debug 用)  │
└──────────────────────────────────────────────────────────────┘
     │
     ▼
Element[] (新增字段 visual_category;type=static|code 不变)
     │
     ▼
[Element Review:拖框 / 改 description / 拆合并 / 改 category]
     │
     ▼
┌──────────────────────────────────────────────────────────────┐
│ Pass 2: 按 visual_category 分组并行 image_gen               │
│ (只走 type=static 元素;type=code 跳过)                       │
│                                                              │
│  按 category 分组 → 每组一次调用                             │
│   reference_images = [原图, crop_el1, crop_el2, ...]         │
│   prompt 编号引用:"参考图 #2 是「奶茶 chip 黑糖珍珠」,      │
│                   就是这张样子,要原样画到绿幕上"            │
└──────────────────────────────────────────────────────────────┘
     │
     ▼
N 张绿幕 PNG → 各 chroma key → 各切片 → 合并到 element list
```

**预期成本**(11 元素页面,假设 3 个 visual_category 含 static 元素;典型 UI 页 2-4 类含 static):
- Pass 1: 5 × $0.03 ≈ $0.15(原 1× = $0.03,5×)
- Pass 2: 3 × $0.17 ≈ $0.51(原 1× = $0.17,3×;最坏 5× = $0.85)
- **合计 ~$0.66/页**(原 ~$0.20/页,3.3×;最坏 ~$1.00/页,5×)

**预期时延**:
- Pass 1: 取最慢路 ≈ 单次 mllm 时延 (20-40s)。**不变**。
- Pass 2: 取最慢路 ≈ 单次 image_gen 时延 (60-220s)。**不变**。
- chroma key + 切片:N × 1s 串行,3-5s。补 progress UI 让用户感知。

## 2. Visual Category 定义

5 个枚举 + 1 个兜底,严格按嘉锟 2026-05-14 提供的定义:

| key | 中文 | 优先级 | 摘要(完整定义见附录 A) |
|---|---|---|---|
| `subject` | 主体 | 1 | IP 角色 / 艺术字标题 / 核心商品图 / 主奖品。**用户复述时会提到的对象** |
| `button` | 按钮 | 2 | 复杂材质 / 异形 / 强活动感 CTA。**普通圆角按钮归 type=code 不切图** |
| `container` | 容器 | 3 | 异形盒子 / 票券 / 卷轴 / 玻璃罩 / 展示台。**承载内容,不是底层环境** |
| `background` | 背景 | 4 | 渐变 / 光晕 / 纹理 / 大色块。**去掉只是氛围弱,核心信息不丢** |
| `decoration` | 装饰 | 5 | 星星 / 彩带 / 高光 / 固定文案徽章。**单独看不重要,组合提精致度** |
| `other` | 其他 | 6 | 5 类都套不上的兜底,人工 review 时归类 |

**优先级冲突解决**:同一物理元素被多路识别到(如 IP 角色被 subject 路 + decoration 路同时识别),取数字小的优先级。

**与 type=static|code 的关系(正交,不互斥)**:

| visual_category | 典型 type | 备注 |
|---|---|---|
| subject | static | 几乎全 static(除非纯文字标题简单可 coding) |
| button | static **或** code | 复杂材质 → static;普通圆角 → code |
| container | static **或** code | 异形/特殊材质 → static 切底图,普通卡片 → code |
| background | static | 大色块也 static(单独切图) |
| decoration | static | 几乎全 static |

`type` 仍由 Pass 1 prompt 中现有的 static/code 判别启发式决定(`description` 中的 text 是 graphic 还是 content),`visual_category` 是 Pass 1 输出的额外标签。

**Pass 2 只处理 type=static 元素**,`visual_category` 用于 Pass 2 内部分组调度。

## 3. 数据 Schema 改动

### 3.1 Element

```diff
 type Element = {
   id: string
   page_id: string
   state_ids: string[]
   name: string
   type: 'static' | 'code'
+  visual_category: 'subject' | 'button' | 'container'
+                  | 'background' | 'decoration' | 'other'
   bbox: [number, number, number, number]
   z_index: number
   description: string
   shape_spec?: string
   material_spec?: string
   cross_state_notes?: string
+  pass1_routes_seen?: string[]   // ['subject','decoration'] 等,debug 用
   reviewed: boolean
   created_at: string
   updated_at: string
 }
```

**迁移**:已有 element 默认 `visual_category: 'other'`,用户 re-run Pass 1 后会被覆盖为正确值。无破坏性。

### 3.2 PipelineRun

`pass: PipelinePassKind` 不再 `'pass1'` / `'pass2'`,改为支持 sub-route:

```diff
-type PipelinePassKind = 'pass1' | 'pass2' | 'validate' | 're_extract'
+type PipelinePassKind =
+  | 'pass1' | 'pass1_subject' | 'pass1_button' | 'pass1_container'
+  | 'pass1_background' | 'pass1_decoration'
+  | 'pass2' | 'pass2_subject' | 'pass2_button' | 'pass2_container'
+  | 'pass2_background' | 'pass2_decoration'
+  | 'validate' | 're_extract'
```

`'pass1'` / `'pass2'` 仍保留,作为「合并后总体 run」记录(每路一次 Pass 1 或 Pass 2 触发,创建 1 条总 run + 5/N 条 sub-run)。**前端轮询时只查总体 run 的 status**(子路全部完成或合并失败时,总 run 标 completed/failed);sub-route run 用于失败定位与成本审计。

### 3.3 Page

```diff
 type Page = {
   id: string
   project_id: string
   name: string
   route_hint?: string
   canonical_state_id: string
+  thumbnail_path?: string   // data/thumbs/{page-id}.png,256px 缩略
   created_at: string
   updated_at: string
 }
```

## 4. Pass 1 改造

### 4.1 5 个 prompt 变体

复用现有 `prompts.pass1_layout` 作为 base,在 system message 顶部加一段「only-X」头:

```
[ONLY-{CATEGORY} PASS]

This pass identifies ONLY {category_chinese} ({category_english}) elements.

{category 完整定义见附录 A 对应小节,直接 copy 进 prompt}

**Be EXHAUSTIVE within this category. Even small/subtle elements count** —
small badges, tiny stickers, micro decorations, faint sparkles all matter.
Other passes will handle other categories — DO NOT return elements of other
categories in this pass. But within {category_english}, MISS NOTHING.

[原 Pass 1 prompt 体]
```

5 个变体共享 base,顶部头部不同。`config.prompts.pass1_layout` 仍是单 string,不拆 5 份(避免 schema 破坏);头部由 `lib/prompts/render-pass1.ts` 在运行时拼接。

**🆕 PoC #2 修正**:首版 only-X prompt 头使用「If unsure, lean toward NOT returning」,实测 decoration 路漏 3 个小徽章(`auto_claim_badge`/`product_claim_badge_1/2`),static 召回率仅 77%。修正为「Be EXHAUSTIVE within this category. Even small/subtle elements count.」。需在实施时再跑一次 PoC #2 单类验证修正版召回率 ≥ 90%。

### 4.2 Routes 并行调度

```ts
// lib/pass1-runner.ts 新版伪代码
async function runPass1(stateId): Promise<Pass1Result> {
  // ...lock + load context
  const categories = ['subject', 'button', 'container', 'background', 'decoration']

  // 5 路并行
  const settled = await Promise.allSettled(
    categories.map(cat => runPass1Route(stateId, cat))
  )

  // 部分失败容忍:至少 3 路成功才认为 Pass 1 整体成功
  const successes = settled.filter(s => s.status === 'fulfilled')
  if (successes.length < 3) throw new Error('Pass 1 多路失败,详见 sub-runs')

  // 合并(见 4.3)
  const merged = mergeRoutes(successes.map(s => s.value))
  await saveElementsForPage(state.page_id, merged)
}
```

**部分失败容忍**:5 路中允许最多 2 路失败(网络/rate limit)。Decoration 路失败影响小,Subject 路失败影响大,但 MVP 不做按路加权,简单数字阈值。

### 4.3 合并算法

```ts
function mergeRoutes(routeResults: { category: string, elements: LlmElementOut[] }[]): Element[] {
  const all: Array<{ el: LlmElementOut, category: string }> = []
  for (const r of routeResults) {
    for (const el of r.elements) all.push({ el, category: r.category })
  }

  // 按 priority 排序(subject 最先,decoration 最后)
  const PRIORITY = { subject: 1, button: 2, container: 3, background: 4, decoration: 5 }
  all.sort((a, b) => PRIORITY[a.category] - PRIORITY[b.category])

  // 顺序遍历,IoU > 0.5 视为已存在(高优先级先占)
  const merged: Element[] = []
  for (const { el, category } of all) {
    const dup = merged.find(m => bboxIoU(m.bbox, el.bbox) > 0.5)
    if (dup) {
      // 同物理元素,只追加 routes_seen
      dup.pass1_routes_seen = [...(dup.pass1_routes_seen ?? []), category]
    } else {
      merged.push({
        ...el,
        visual_category: category,
        pass1_routes_seen: [category],
        // ...
      })
    }
  }
  return merged
}

function bboxIoU(a: [number, number, number, number], b: [number, number, number, number]): number {
  // 标准 IoU,bbox 是 [x,y,w,h] 归一化
}
```

**已知边界 case**:
- 元素物理紧贴:IoU 可能误判为同元素 → review 时用户可拆分
- IoU 0.5 阈值是初始默认,UI 不暴露,基于 PoC 调整
- 用户已 reviewed 过的 element:re-run Pass 1 时**不覆盖** `visual_category` / `description` 等用户编辑字段(同现有 `mergeElements` 逻辑,只追加 state_ids)

## 5. Pass 2 改造

### 5.1 按 category 分组

```ts
// lib/pass2-runner.ts 新版伪代码
async function runPass2(stateId): Promise<Pass2Result> {
  // ...lock + load
  const staticEls = elements.filter(e => e.type === 'static')
  const grouped = groupBy(staticEls, e => e.visual_category)

  // 每组一次调用,并行
  const settled = await Promise.allSettled(
    Array.from(grouped).map(([cat, els]) =>
      runPass2Route(stateId, cat, els)
    )
  )

  // 部分失败容忍:成功的路各自抠图 + 切片,失败的 element 标 status=failed
  // ...
}

async function runPass2Route(stateId, category, elements): Promise<RouteResult> {
  const rawPng = await readRaw(stateId)
  const crops = await Promise.all(
    elements.map(el => sharp(rawPng).extract(bboxToPixels(el.bbox, state.width, state.height)).toBuffer())
  )

  const promptText = renderPass2RoutePrompt(category, elements)
  const refs = [rawPng, ...crops]   // 第 0 张是原图,第 1+ 张是 crop

  const { image: greenScreen } = await callImageGen(provider, {
    prompt: promptText,
    reference_images: refs,
    // ...
  })

  await chromaKey + slice + writeAssets   // 同现有 pipeline
}
```

### 5.2 Prompt 模板(新)

```
我们来尝试一下,把这张图({{page_description}}) 里的{{category_chinese}}类元素提取出来,单独放在一张鲜亮的纯绿色 #00FF00 背景画布上,作为后期抠像的绿幕。元素本身不要使用这个绿色。

第 1 张参考图是原图,展示了这些元素在画面里的整体样貌。后面的参考图是从原图裁剪出的每个元素的特写,要画的就是这些:

- 参考图 #2:「{{el1.name}}」({{el1.description}})
- 参考图 #3:「{{el2.name}}」({{el2.description}})
...

共 {{count}} 个元素,记得每个都画到。元素之间留出至少一整个元素宽度的空隙,宁可画布留白多也不要挤在一起。每个元素都要跟参考图里完全一致——保持原图的风格、颜色、文字内容,不要重新设计任何元素。
```

**措辞硬约束**(继承 v11 教训):
- ❌ 不写 "TRUST", "MUST", "EXACTLY", "pixel-faithfully" 等激进词
- ❌ 不在 prompt 里塞 entity_name / bbox / JSON
- ✅ 自然中文 + "记得 / 保持 / 不要重新设计"
- ✅ 编号引用参考图("参考图 #2 是 X")是新元素,需 PoC 验证

### 5.3 切片合并

每路独立 chroma key + 切片,得到 N 个 sliced asset 数组。按以下顺序合并到 elements:

1. 每路只在该 category 的 elements 范围内匹配(避免跨 category 串)
2. 路内仍用 `(y, x)` 排序对应 element 顺序(同现有 `pass2-runner.ts:128`)
3. 整体 limit:`Math.min(category_elements.length, slices.length)`

**已知 case**:某路实际切片数 < element 数(模型漏画) → 漏画的 element status=`failed`,UI 提示用户单元素重抠(走现有 `re_extract` API)。

## 6. 列表缩略图(独立子项 β)

**触发**:`POST /api/pages/[id]/states` 上传 state 时,如果该 state 是 canonical(或 page 的第一个 state),sharp 缩到 256px 写入 `data/thumbs/{page-id}.png`,更新 `Page.thumbnail_path`。

**展示**:
- `ProjectCard`:展示该 project 第一个 page(按 created_at)的 thumbnail
- `PageCard`:展示该 page 自己的 thumbnail

**API 改动**:
- `GET /api/projects` 返回 `Project & { sample_thumbnail_url?: string }`(URL 直接指向 `/api/thumbs/{page-id}`)
- `GET /api/projects/[id]/pages` 返回 `Page & { thumbnail_url?: string }`
- 新增 `GET /api/thumbs/[page-id]`:静态文件 route,从 `data/thumbs/{page-id}.png` 流式响应。**不存在时返回 404**(前端回退到 icon)

**前端改动**:
- `ProjectCard.tsx` / `PageCard.tsx` 加 `<img src={thumbnail_url} />`,加载失败 onError 回退到 `<Folder/>` / `<FileText/>` icon
- `data/thumbs/` 目录纳入 `data/` 静态服务模式(同 `data/raw/`)

**与 PR10 的兼容性**:`projects/page.tsx` 在 PR10 改了 header,但列表卡片是 `ProjectCard` 子组件,文件不冲突。等 PR10 merge 后再开本子项分支。

## 7. UI 改动清单

### 7.1 Element Review

- 列表项加 `visual_category` 中文 badge(主体/按钮/容器/背景/装饰/其他)
- 详情面板加 `visual_category` select 让用户改
- 列表筛选按钮:按 visual_category 过滤(可多选)
- **重要文案修复**:Element Review 顶部加一句提示
  > 拖动框框 = 调整该元素的位置坐标,会被记录到导出 layout.json,且会作为 Pass 2 的参考图裁剪边界。改 description / 类别 / 拆合并需要重跑 Pass 2 才生效。

### 7.2 Pipeline Progress UI

- Pass 1 触发后,前端显 `5/5 routes complete` 进度(或失败时 `4/5 routes complete, 1 failed`)
- Pass 2 同上,按 category 数量
- chroma key + 切片阶段显「正在抠图...」,N 路串行时显当前进度

### 7.3 Settings

- `prompts.pass1_layout` 编辑器加一行说明:「此 base prompt 在运行时被 5 路头部包装,每路只识别一类」
- 新增 `prompts.pass2_route_template` 字段(替代 `prompts.pass2_extract`,迁移时旧字段保留)

## 8. PoC v12 验证(已完成 ✅)

详细报告:[`poc/v12-multi-route/REPORT.md`](../../../poc/v12-multi-route/REPORT.md)

### 摘要

| PoC | 状态 | 关键 finding |
|---|---|---|
| #1 多参考图行为 | **✅ 通过** | B 路完胜 A:5/5 元素准确不多不少,细节贴近 crop,无 regenerate。架构成立 |
| #2 Pass 1 5 路单类质量 | **✅ 条件通过** | 严格性 OK(跨路 IoU>0.5 仅 1 对);static 召回 77%,需修 prompt 头(已在 §4.1 修正,实施时复测) |
| #3 端到端 sanity | 跳过 | #1+2 已支撑实施决策,端到端在 Phase 8b/8c 集成测试自然覆盖 |

### 副发现

- PoC 实测中 apimart 单 task `actual_time` 一度达 889s,但 SPEC 默认 `poll_max_attempts: 24` (≤132s) **保持不变**——超时是预期行为,失败后用户可重试,**不靠 silent 长等待**(嘉锟 2026-05-14 拍板:UX 优先,timeout 短 + 重试,胜过等 15 分钟)。本 spec 不修这条,作为已知 ops 现象记录在 PoC 报告
- PoC #2 显示 v12 5 路能识别出 v9b 1-shot 漏掉的元素(2 个 sparkle + Artistic Title 升级),说明分类识别比单一识别更细致——架构带来的产品价值高于单纯"召回率不退化"

### 实施前需补的小验证

- **PoC #2 修正版**(实施 Phase 8b 第一步):用 §4.1 修正后的 only-X prompt 头重跑一次 PoC #2,确认 static 召回率 ≥ 90%

## 9. 实施分阶段

| Phase | 内容 | 依赖 | 估时 |
|---|---|---|---|
| 8a | PoC #2 修正版复测(EXHAUSTIVE only-X prompt 头,确认 static 召回 ≥ 90%) | PR10 merge | 0.5 天 |
| 8b | Pass 1 5 路并行 + 合并算法 + Element schema 加 `visual_category` | 8a 通过 | 3-4 天 |
| 8c | Pass 2 按类分组 + 多参考图(crop 当 reference_images) + `callImageGen` 接口扩展 | 8b 完成 | 3-4 天 |
| 8d | UI 改造(badge / progress / 拖框语义文案) | 8b/8c 完成 | 2-3 天 |
| 8e | 列表缩略图(独立) | PR10 merge | 1-2 天,可与 8a-d 并行 |

**总计**:9-13 天(PoC #1+2 主体已完,Phase 8a 只剩修正版小验证)。每个 phase 一个 PR(`feat/phase-8a-poc-prompt-tune` / `feat/phase-8b-pass1-multi-route` / ...)。

## 10. 风险 + 回滚

| 风险 | 缓解 | 回滚路径 |
|---|---|---|
| PoC #1 失败(多参考图触发 regenerate) | §5.2 fallback 不喂 crop,只描述。问题 #4 由 §7.1 UI 教育解决 | 仅实施 8b + 8d + 8e,跳过多参考图改造 |
| PoC #2 失败(单类 prompt 严格性差) | fallback 到 1-shot + visual_category tag。Pass 1 不并行,但 Pass 2 仍按 category 分组并行 | 仅实施 8c + 8d + 8e |
| Pass 1 5 路成本上升用户难接受 | settings 暴露开关,允许用户回退到 1-shot | 加 `settings.pass1_multi_route: boolean` |
| chroma key 性能在 N=5 路实测卡顿 | 8d 阶段加 worker_threads(本 spec 选 A 不优化,但留口子) | 加 `lib/alpha-key-worker.ts` |
| visual_category Pass 1 误判 80% 元素归同一类 | UI 提供改 category + Pass 2 重跑 | 用户主权,不阻断 |

## 11. 文档同步(实施时)

**改 SPEC.md**:
- § 数据 schema § Element 加 `visual_category` 字段
- § Pass 1 prompt 模板加 5 路头部说明
- § Pass 2 prompt 模板替换为 §5.2
- § 抠图 + 切片 § 切片合并加跨 category 约束

**改 PRD.md**:
- 用例图加「Pass 1 后用户可见每个元素的 visual_category」
- 用例图加「列表显示缩略图」

**改 CLAUDE.md § 反直觉强约束**:
- §4「只有二分类」补一句:`visual_category` 是正交维度,**不是**第三类 type。新人易误读
- §6 Pass 2 prompt 章节追加 v12 多参考图编号引用规则
- 加 §8(新):Pass 1 5 路并行规则 + bbox IoU 合并阈值

## 附录 A: Visual Category 完整定义

> 嘉锟 2026-05-14 提供。直接复制进每路 Pass 1 prompt 的 only-X 头部。

### A.1 Background 背景

去除所有 UI 元素、主体、容器、装饰后,仍然存在的底层视觉环境。背景不是页面里的某个「物件」,而是整个画面的视觉底色和空间氛围。它决定页面的基础气质。背景类切图通常位于最底层,不直接承载点击、文案或业务信息。

包含:纯视觉背景图 / 渐变背景 / 光晕背景 / 纹理背景 / 纸感背景 / 玻璃感背景 / 星空 / 云雾 / 草地 / 城市远景 / 大面积色块 / 氛围光 / 背景噪点 / 背景中的抽象波形 / 远景场景 / 空间透视 / 暗角 / 柔光。

不包含:可点击按钮 / 承载文案的卡片 / 前景角色 / 主视觉物体 / 独立贴纸 / 星星彩带等可独立复用的小装饰 / 弹窗本体 / 商品卡片。

判断:把它去掉后,页面还有没有主体和信息?如果有,只是整体氛围变弱,那它大概率是背景。

### A.2 Container 容器

承载内容、信息或主体的特殊视觉结构,且无法通过普通代码组件稳定还原。容器的本质是「装东西」,承担信息结构和视觉分组。普通圆角卡片/弹窗/列表可以 coding;特殊造型/复杂材质/异形结构/舞台感结构需要切图。

包含:盒子 / 舞台 / 展示柜 / 异形弹窗 / 特殊卡片 / 不规则面板 / 票券 / 信封 / 卷轴 / 证书框 / 玻璃罩 / 包装盒 / 展示台 / 奖励框 / 特殊边框 / 特殊底板 / 复杂列表卡片底图 / 承载文字的异形标签底板 / 承载角色的场景平台。

不包含:普通圆角矩形卡片 / 普通白底弹窗 / 普通按钮 / 普通 tab / 纯装饰性星星彩带 / 独立角色 / 不承载信息的背景。

特征:有明确边界、把内容包起来、形成层级、可能承载文字按钮角色商品任务、特殊外轮廓、可能包含前中后景、需要和前端内容动态组合。

### A.3 Button 按钮

具备明确点击行为,但由于造型/材质/动效/品牌感过强,无法用普通代码按钮实现的按钮资产。普通按钮(常规圆角/黑色/渐变/描边)不应该切图。

包含:异形按钮 / 游戏化按钮 / 贴纸按钮 / 拟物按钮 / 复杂渐变按钮 / 高光扫光按钮 / 复杂边框按钮 / 3D 厚度按钮 / 材质纹理按钮 / 固定艺术字按钮 / 奖励领取按钮 / 抽奖按钮 / 开箱按钮 / 强活动感 CTA。

不包含:普通圆角 / 普通胶囊 / 普通文字链 / 普通 icon button / 普通 tab / 普通底部导航 / 可以用 CSS 稳定实现的线性渐变按钮。

判断 4 点:异形? 复杂材质? 复杂状态? 是否情绪峰值的一部分?

### A.4 Decoration 装饰

不直接承担核心信息结构,也不是页面主体,但用于补充氛围、节奏、状态感、精致度的小型视觉资产。

包含:星星 / 彩带 / 高光 / 粒子 / 小物件 / 胶囊 / 气泡 / 徽章 / 纸屑 / 爱心 / 云朵 / 小花 / 光点 / 闪电 / 小箭头 / 胶带 / 印章 / 火焰 / 金币 / 钻石 / 能量 / 小挂件 / 角落贴纸 / 前景虚化物 / 扫光层 / 发光描边 / 辅助图标插画。

胶囊/气泡/徽章双归属规则:
- **固定贴纸型** → decoration(写死的 HOT 贴纸 / 固定 SUPER 徽章 / 不承载动态内容的小气泡 / 装饰胶囊 / 角落奖励章)
- **承载动态内容** → container(运营可配置气泡 / 任务状态胶囊 / 商品促销标签 / 可变文案徽章 / 用户等级标签 / 动态数量标签)

装饰 vs 背景:装饰可单独复用,背景是整体底层。整片星空底图 = 背景;单个星星 = 装饰。

### A.5 Subject 主体

页面中最主要的视觉表达对象,用户第一眼会把它当成「主角」来理解。

A. 形象主体:IP / 角色 / 商品 / 奖品 / 3D 物件 / 卡通人物 / 吉祥物。负责「看见一个对象」。

B. 文字符号主体:艺术字标题 / 异形标题 / 品牌字标 / 活动主标题 / 视觉化 slogan。负责「看见一个主题」。

判断:用户复述这个页面时,会不会提到它?会 → 主体;不会,只是觉得页面更好看 → 装饰。

主体 vs 容器:主体是被观看的对象,容器是承载对象的结构。角色 → 主体;角色站立的舞台 → 容器。

### A.6 优先级

`subject > button > container > background > decoration > other`

同物理元素被多路识别时取数字小的优先级保留。
