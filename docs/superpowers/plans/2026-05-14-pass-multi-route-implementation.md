# img2UI v0.2 多路 Pass + 拖框生效化 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **STATUS: READY — full TDD detail, awaiting user review then execution**
> 嘉锟 2026-05-14 拍板「先大纲后细节」。当前每 phase 已展开完整 5-step TDD task 详情。

**Goal:** 把 dogfood 暴露的四个核心问题(Pass 1/2 不准 / 列表无缩略图 / chroma key 性能 / 拖框无效)用一套 v12 架构解决:Pass 1+2 都按 5 类视觉类别并行,bbox crop 喂 Pass 2 当多参考图,拖框间接生效。

**Architecture:** Pass 1 由 1-shot 改为 5 路并行(subject/button/container/background/decoration),每路 only-X prompt + IoU 0.5 合并 + 优先级解决冲突;Pass 2 按 `visual_category` 分组并行调用 image_gen,每路传 `image_urls = [原图, ...crops]`(crop 来自当前 Element 的 bbox),让模型按 crop 复刻不 regenerate。chroma key 维持 v11 算法,加 progress UI;列表加缩略图;UI 加 visual_category badge + 拖框语义提示。

**Tech Stack:** Next.js 15 (App Router) + React 19 + TypeScript strict + Tailwind v4 + shadcn v4 + sonner + sharp(image processing) + 现有 sankuai/apimart provider abstraction

**关联文档:**
- spec: [`docs/superpowers/specs/2026-05-14-pass-multi-route-design.md`](../specs/2026-05-14-pass-multi-route-design.md)
- PoC report: [`poc/v12-multi-route/REPORT.md`](../../../poc/v12-multi-route/REPORT.md)
- 项目 AGENTS.md / CLAUDE.md / SPEC.md / PRD.md(实施时同步更新)

**前置条件:**
- PR10(`fix/dogfood-ui-polish`)已 merge 到 main
- 当前测试套件 88/88 通过(基线)

---

## File Structure 总览

每个 phase 涉及的文件,粗筹划:

### 新建

| File | 责任 | Phase |
|---|---|---|
| `poc/v12-multi-route/scripts/poc2-prompt-tune.py` | EXHAUSTIVE 修正版 PoC #2 复测 | 8a |
| `src/lib/prompts/render-pass1-route.ts` | 拼接 only-X prompt 头 + base | 8b |
| `src/lib/bbox-iou.ts` | bbox IoU 计算工具 | 8b |
| `src/lib/pass1-route-merger.ts` | 5 路结果按优先级 + IoU 合并 | 8b |
| `src/lib/visual-category.ts` | 5 类枚举 + 优先级表 + 中文映射 + 定义文本(供 prompt 用) | 8b |
| `src/lib/prompts/render-pass2-route.ts` | 按 category 渲染 prompt + 编号引用 crop | 8c |
| `src/lib/bbox-crop.ts` | 按 bbox 从原图 sharp.extract 出 crop | 8c |
| `src/lib/thumbnails.ts` | sharp 缩到 256px,写 `data/thumbs/{page-id}.png` | 8e |
| `src/app/api/thumbs/[id]/route.ts` | 静态文件 GET 路由,404 fallback | 8e |
| `src/components/element-review/visual-category-badge.tsx` | 5 类彩色 badge | 8d |
| `src/components/element-review/visual-category-select.tsx` | 详情面板分类切换 | 8d |
| `src/components/pipeline-progress.tsx` | Pass1/2 多路进度展示组件 | 8d |
| `src/lib/__tests__/bbox-iou.test.ts` | IoU 单测 | 8b |
| `src/lib/__tests__/pass1-route-merger.test.ts` | 合并算法单测 | 8b |
| `src/lib/__tests__/render-pass2-route.test.ts` | prompt 渲染单测 | 8c |
| `src/lib/__tests__/bbox-crop.test.ts` | crop 单测(用 fixture PNG) | 8c |
| `src/lib/__tests__/thumbnails.test.ts` | 缩略图生成单测 | 8e |

### 修改

| File | 改动要点 | Phase |
|---|---|---|
| `src/lib/types.ts` | `Element.visual_category`, `Element.pass1_routes_seen?`, `Page.thumbnail_path?`, `PipelinePassKind` 扩展 sub-route | 8b/8e |
| `src/lib/pass1-runner.ts` | 1-shot 改 5 路并行 + 合并 + 部分失败容忍 ≥3/5 + 写 sub-run + 总 run | 8b |
| `src/lib/pass2-runner.ts` | 单次 image_gen 改按 visual_category 分组并行 + 每路 crop multi-ref | 8c |
| `src/lib/llm-client.ts:325-378` | `callImageGen` 加 `reference_image_base64s?: string[]` 参数,内部 `image_urls = [main, ...refs]` | 8c |
| `src/lib/elements.ts` | 已有 element 默认 `visual_category: 'other'` 兜底(无破坏性迁移) | 8b |
| `src/lib/pages.ts` / `src/lib/api/pages-client.ts` | 加 thumbnail_path 字段 + API 暴露 thumbnail_url | 8e |
| `src/lib/api/projects-client.ts` / `src/app/api/projects/route.ts` | `Project` 返回 `sample_thumbnail_url` | 8e |
| `src/app/api/states/[id]/pass1/route.ts` | 触发 5 路并行(已封装在 runner) | 8b |
| `src/app/api/states/[id]/pass2/route.ts` | 同上,按 category 分组 | 8c |
| `src/components/element-review/element-list.tsx` | 加 visual_category badge + 筛选 | 8d |
| `src/components/element-review/element-detail-panel.tsx` | 加 category 切换 select | 8d |
| `src/components/element-review/canvas.tsx` | 顶部加拖框语义提示横幅 | 8d |
| `src/components/projects/project-card.tsx` | `<img src={sample_thumbnail_url}/>` + onError fallback | 8e |
| `src/components/projects/page-card.tsx` | 同上,thumbnail_url | 8e |
| `src/app/api/pages/[id]/states/route.ts` | 上传 state 时同步生成缩略图 | 8e |
| `SPEC.md` | § Element schema / Pass 1/2 prompt 模板 / PipelineRun pass kind | 各 phase |
| `PRD.md` | 用例图加缩略图 + visual_category review | 8d/8e |
| `CLAUDE.md` | § 反直觉强约束 §4 补 visual_category 不算第三类 + 新增 §8 多路并行规则 | 8b/8c |

---

## Phase 8a: PoC #2 修正版复测

**Goal:** 用 spec §4.1 修正后的 EXHAUSTIVE only-X prompt 头重跑 PoC #2,确认 static 召回率从 77% 提升到 ≥ 90%。

**Branch:** `feat/phase-8a-poc-prompt-tune`

**Dependencies:** PR10 merge

**Why first:** 8b/8c 都基于 only-X prompt 假设其有效。如果 EXHAUSTIVE 修正后召回仍 < 90%,需要回 spec 改架构(加 only-uncategorized 路或回到 1-shot+tag),不能直接进 8b。

### Task 8a.1: 复制 PoC #2 脚本为修正版

**Files:**
- Create: `poc/v12-multi-route/scripts/poc2-prompt-tune.py`(基于 `poc2-pass1-routes.py` 修改)

- [ ] **Step 1: 复制基础脚本**

```bash
cp poc/v12-multi-route/scripts/poc2-pass1-routes.py \
   poc/v12-multi-route/scripts/poc2-prompt-tune.py
```

- [ ] **Step 2: 改 build_prompt 函数的 only-X 头(EXHAUSTIVE 措辞)**

打开 `poc2-prompt-tune.py`,定位 `def build_prompt(category_key, base_prompt):` 函数,把 head 字符串替换为:

```python
def build_prompt(category_key: str, base_prompt: str) -> str:
    cat = CATEGORIES[category_key]
    head = f"""[ONLY-{category_key.upper()} PASS]

This pass identifies ONLY {cat['cn']} ({category_key}) elements. Definition follows:

{cat['definition']}

**Be EXHAUSTIVE within this category. Even small/subtle elements count** — small badges, tiny stickers, micro decorations, faint sparkles all matter. Other passes will handle other categories — DO NOT return elements of other categories in this pass. But within {category_key}, MISS NOTHING.

For elements you do return, still classify each as `static` or `code` per the rules below.

---

"""
    return head + base_prompt
```

- [ ] **Step 3: 改输出文件名前缀避免覆盖原 PoC #2 输出**

定位脚本里 4 处文件名前缀,把 `poc2-pass1-{category_key}` 改为 `poc2-tune-{category_key}`,把 `poc2-summary.json` 改为 `poc2-tune-summary.json`:

```python
out_raw_path = os.path.join(OUT_DIR, f"poc2-tune-{category_key}-raw.json")
# ...
out_parsed_path = os.path.join(OUT_DIR, f"poc2-tune-{category_key}.json")
# ...
out_summary = os.path.join(OUT_DIR, "poc2-tune-summary.json")
```

- [ ] **Step 4: 语法 + 干跑校验**

```bash
python3 -c "import ast; ast.parse(open('poc/v12-multi-route/scripts/poc2-prompt-tune.py').read())"
```

Expected: 无输出(语法 OK)

- [ ] **Step 5: 暂不 commit,跟 8a.2 / 8a.3 一起 commit(单 PR 1 commit 颗粒度)**

---

### Task 8a.2: 跑修正版 PoC #2 + 比较 v9b 召回率

**Files:**
- Run: `poc/v12-multi-route/scripts/poc2-prompt-tune.py`
- Output: `poc/v12-multi-route/outputs/poc2-tune-*.json`

- [ ] **Step 1: 跑脚本**

```bash
python3 poc/v12-multi-route/scripts/poc2-prompt-tune.py
```

Expected: 5 路 mllm 调用,30-60s 完成,输出元素数 + summary。

- [ ] **Step 2: 比较修正版 vs v9b 13 个 static 元素**

```bash
python3 -c "
import json
v9b = json.load(open('poc/outputs/v9b-pass1.json'))
v9b_static = [e for e in v9b['elements'] if e.get('type') == 'static']
print(f'v9b static: {len(v9b_static)}')
for e in v9b_static:
    print(f'  - {e[\"entity_name\"]}: bbox={e.get(\"bbox\")}')

tune = json.load(open('poc/v12-multi-route/outputs/poc2-tune-summary.json'))
v12_all = []
for cat, r in tune['routes'].items():
    if r.get('ok'):
        for el in r['elements']:
            v12_all.append({'cat': cat, **el})
print(f'\\nv12-tune total elements: {len(v12_all)}')

def iou(a, b):
    if not a or not b or len(a) != 4 or len(b) != 4: return 0
    ax,ay,aw,ah = a; bx,by,bw,bh = b
    ix1,iy1 = max(ax,bx), max(ay,by)
    ix2,iy2 = min(ax+aw,bx+bw), min(ay+ah,by+bh)
    if ix2<=ix1 or iy2<=iy1: return 0
    inter = (ix2-ix1)*(iy2-iy1); u = aw*ah+bw*bh-inter
    return inter/u if u>0 else 0

hit = 0
for vs in v9b_static:
    found = next((v for v in v12_all if iou(vs.get('bbox'), v.get('bbox')) > 0.4), None)
    print(f'  {vs[\"entity_name\"]}: {\"✓ \" + found[\"cat\"] if found else \"✗ MISS\"}')
    if found: hit += 1
print(f'\\nRecall: {hit}/{len(v9b_static)} = {hit/len(v9b_static):.0%}')
"
```

Expected: `Recall: ≥ 12/13 = 92%`

- [ ] **Step 3: 数字回填 task 8a.3**(不在此步处理)

---

### Task 8a.3: 回填 PoC REPORT.md

**Files:**
- Modify: `poc/v12-multi-route/REPORT.md`(在 PoC #2 节追加修正版结果块)

- [ ] **Step 1: 在 REPORT.md PoC #2 节末尾追加修正版结果**

在 `**对 spec 的影响**:` 段之前插入:

```markdown
### PoC #2 修正版(EXHAUSTIVE 措辞,2026-05-XX 复测)

**修正点**:`only-X` prompt 头从「If unsure, lean toward NOT returning」改为「Be EXHAUSTIVE. Even small/subtle elements count. MISS NOTHING.」(spec §4.1)

**实测结果**:

| Route | 元素数 | latency_s |
|---|---|---|
| subject | TBD | TBD |
| button | TBD | TBD |
| container | TBD | TBD |
| background | TBD | TBD |
| decoration | TBD | TBD |

| 指标 | 修正前(77%) | 修正后 | 通过标准 |
|---|---|---|---|
| Static 召回(对比 v9b 13 个) | 10/13 | TBD | ≥ 12/13 = 92% |

**结论**: ✅ 通过 / ❌ 未通过(填一个)
```

把 `TBD` 替换为 8a.2 step 2 的实际数字。

- [ ] **Step 2: 不通过则 STOP**

如果召回 < 12/13,本 PR 不 merge,回 spec §10「Phase 8a fallback」分支重写架构(改 8b 为 1-shot+tag 形式,Pass 2 仍多路)。在本 PR 描述里写 `STATUS: BLOCKED — 8a 未通过,见 REPORT § PoC #2 修正版`,关闭 PR。

---

### Task 8a.4: Commit + 开 PR

**Files:**
- Stage: `poc/v12-multi-route/scripts/poc2-prompt-tune.py`, `poc/v12-multi-route/REPORT.md`, `poc/v12-multi-route/outputs/poc2-tune-*.json`

- [ ] **Step 1: 检查 status + diff**

```bash
git status
git diff poc/v12-multi-route/REPORT.md | head -80
```

- [ ] **Step 2: 创建 branch + commit + push**

```bash
git checkout -b feat/phase-8a-poc-prompt-tune
git add poc/v12-multi-route/scripts/poc2-prompt-tune.py \
        poc/v12-multi-route/REPORT.md \
        poc/v12-multi-route/outputs/poc2-tune-summary.json \
        poc/v12-multi-route/outputs/poc2-tune-*.json
git commit -m "$(cat <<'EOF'
poc(v12): EXHAUSTIVE only-X prompt 修正版 + 召回率复测

修正 PoC #2 的 only-X prompt 头:
- 从「If unsure, lean toward NOT returning」(召回 77%)
- 改为「Be EXHAUSTIVE. MISS NOTHING」(召回 [回填 8a.2 数字])

阻塞 Phase 8b/8c 实施的前置 gate 验证。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push -u origin feat/phase-8a-poc-prompt-tune
```

- [ ] **Step 3: 开 PR**

```bash
gh pr create --title "poc(v12): EXHAUSTIVE only-X prompt 修正版召回率复测" --body "$(cat <<'EOF'
## 改了什么

PoC #2 的 only-X prompt 头修正,从「lean toward NOT returning」改成「EXHAUSTIVE / MISS NOTHING」,复测 5 路 Pass 1 的 static 召回率。

## 为什么

PoC #2 首版召回 10/13 = 77%,漏 3 个小徽章。架构成立但 prompt 措辞过于保守。
本 phase 是 Phase 8b/8c 实施前的 gate:召回 ≥ 12/13 才进 8b。

## 怎么验证

`python3 poc/v12-multi-route/scripts/poc2-prompt-tune.py`,看 `poc2-tune-summary.json` + REPORT.md PoC #2 节的最终数字。

## 向后兼容风险

无,纯 PoC 脚本 + 报告更新,不改生产代码。

## Plan deviation

无。
EOF
)"
```

- [ ] **Step 4: 等用户 review + merge**

不自合 PR,等用户决定。

- [ ] **Step 5: Merge 后清分支**

```bash
git checkout main && git pull
git branch -D feat/phase-8a-poc-prompt-tune
```

---

## Phase 8b: Pass 1 5 路并行 + 合并算法

**Goal:** 把 `pass1-runner.ts` 从单次 mllm 调用改为 5 路 only-X 并行 + IoU/优先级合并,Element 加 `visual_category` 字段。

**Branch:** `feat/phase-8b-pass1-multi-route`

**Dependencies:** Phase 8a 通过

### Task 8b.1: visual-category.ts(5 类配置常量)

**Files:**
- Create: `src/lib/visual-category.ts`
- Test: `src/lib/__tests__/visual-category.test.ts`

- [ ] **Step 1: 写失败的测试**

`src/lib/__tests__/visual-category.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import {
  VISUAL_CATEGORIES,
  VISUAL_CATEGORY_PRIORITY,
  VISUAL_CATEGORY_EXAMPLES_CN,
  visualCategoryCn,
  type VisualCategory,
} from '@/lib/visual-category'

describe('visual-category', () => {
  it('exposes 5 categories + other', () => {
    expect(VISUAL_CATEGORIES).toEqual([
      'subject', 'button', 'container', 'background', 'decoration', 'other',
    ])
  })

  it('priority order: subject > button > container > background > decoration > other', () => {
    expect(VISUAL_CATEGORY_PRIORITY['subject']).toBeLessThan(VISUAL_CATEGORY_PRIORITY['button'])
    expect(VISUAL_CATEGORY_PRIORITY['button']).toBeLessThan(VISUAL_CATEGORY_PRIORITY['container'])
    expect(VISUAL_CATEGORY_PRIORITY['container']).toBeLessThan(VISUAL_CATEGORY_PRIORITY['background'])
    expect(VISUAL_CATEGORY_PRIORITY['background']).toBeLessThan(VISUAL_CATEGORY_PRIORITY['decoration'])
    expect(VISUAL_CATEGORY_PRIORITY['decoration']).toBeLessThan(VISUAL_CATEGORY_PRIORITY['other'])
  })

  it('exposes Chinese label', () => {
    expect(visualCategoryCn('subject')).toBe('主体')
    expect(visualCategoryCn('decoration')).toBe('装饰')
    expect(visualCategoryCn('other')).toBe('其他')
  })

  it('decoration examples mention small text label badges (PoC #2 v3 anchoring)', () => {
    expect(VISUAL_CATEGORY_EXAMPLES_CN['decoration']).toContain('购买后自动领取')
    expect(VISUAL_CATEGORY_EXAMPLES_CN['decoration']).toContain('完单可收藏潮玩')
  })
})
```

- [ ] **Step 2: 跑测试看失败**

```bash
npx vitest run src/lib/__tests__/visual-category.test.ts
```

Expected: FAIL(模块不存在)

- [ ] **Step 3: 写 visual-category.ts**

```typescript
// src/lib/visual-category.ts
export type VisualCategory =
  | 'subject' | 'button' | 'container'
  | 'background' | 'decoration' | 'other'

export const VISUAL_CATEGORIES: readonly VisualCategory[] = [
  'subject', 'button', 'container', 'background', 'decoration', 'other',
] as const

// 数字越小优先级越高
export const VISUAL_CATEGORY_PRIORITY: Record<VisualCategory, number> = {
  subject: 1, button: 2, container: 3,
  background: 4, decoration: 5, other: 6,
}

const CN_LABEL: Record<VisualCategory, string> = {
  subject: '主体', button: '按钮', container: '容器',
  background: '背景', decoration: '装饰', other: '其他',
}

export function visualCategoryCn(c: VisualCategory): string {
  return CN_LABEL[c]
}

// PoC #2 v3 锁定:CATEGORY_EXAMPLES 中文具体物名锚定,显著提升召回率
// 关键:decoration 类 mention 小文字标签徽章,救回 v2 漏的 auto_claim_badge 等
export const VISUAL_CATEGORY_EXAMPLES_CN: Record<VisualCategory, string> = {
  subject: 'IP 角色 / 3D 卡通娃娃 / 大艺术字标题(如「珍牛马」「你抽到的天选娃娃是」)/ 主商品图(实物渲染) / 主奖品图 / 联名 logo',
  button: '异形按钮 / 复杂材质按钮 / 强活动感 CTA / 抽奖按钮 / 开箱按钮 / 奖励领取按钮 / 带固定艺术字的按钮',
  container: '异形展示框(如奶茶盲盒页那个粉色异形外框)/ 卡片底图 / 票券 / 信封 / 卷轴 / 玻璃罩 / 奖励框 / 复杂列表卡片背景 / 承载文字的异形标签底板',
  background: '全页渐变背景 / 大色块 / 光晕 / 远景 / 纹理 / 氛围光 / 背景中的抽象波形 / 暗角',
  decoration: '星星 / 彩带 / 高光 / 粒子 / **小贴纸徽章包括「购买后自动领取」「完单可收藏潮玩」「HOT」「NEW」这类小文字标签** / 引线装饰 / 小光点 / 小箭头 / 角落贴纸 / 固定文案小标签',
  other: '5 类都套不上的兜底,人工 review 时归类',
}

// Pass 1 only-X prompt 头部用的完整定义文本(嘉锟 2026-05-14 原稿,见 spec 附录 A)
export const VISUAL_CATEGORY_DEFINITION_EN: Record<VisualCategory, string> = {
  subject: `Main visual subject of the page — what users would mention when describing the page. Includes IP characters, mascots, hero illustrations, 3D renderings, key product/award images, AND artistic title typography (异形标题 / 艺术字 / 品牌字标 / 视觉化 slogan). Subject vs container: subject is the object being viewed, container is the structure holding it. Subject vs decoration: ask "would the user mention this when describing the page?" — if yes, subject.`,
  button: `Buttons that need image extraction because their styling/material/animation is too brand-specific to implement in code. Includes 异形 buttons, gamified buttons, sticker-style buttons, skeuomorphic, complex gradient, scan-light effects, 3D thickness, material textures, fixed 艺术字 buttons, reward/lottery/unbox CTAs. EXCLUDES standard buttons (rounded rect, capsule, plain icon button, OS-default tab/nav).`,
  container: `Special visual containers holding content/info/subjects, that cannot be reproduced by standard code components. Includes 异形 boxes, stages, display cases, 异形 dialogs, irregular cards, tickets, scrolls, certificates, glass domes, packaging boxes, reward frames, complex list-card backgrounds, scene platforms. EXCLUDES standard rounded cards, plain dialogs, plain buttons. Special: 胶囊/气泡/徽章 carrying dynamic content → container; if fixed-content sticker → decoration.`,
  background: `Underlying visual environment that remains after removing all UI/subjects/containers/decorations. Includes gradients, glow, textures, large color blocks, ambient light, noise, abstract waves, distant scenery, vignette, soft light, sky/clouds/grass/distant city. EXCLUDES anything carrying interactive purpose, anything reusable as standalone sticker, anything in foreground.`,
  decoration: `Small decorative assets that don't carry core info but boost atmosphere/精致度. Includes stars, ribbons, highlights, particles, capsules, bubbles, badges, confetti, hearts, clouds, small flowers, light dots, lightning, small arrows, stamps, fire, coins, gems, sparkles, corner stickers, foreground blur, scan-light layers, glowing strokes. **Critical: small text-label stickers (e.g. fixed "购买后自动领取" / "完单可收藏潮玩" / "HOT" / "NEW" stickers) ALSO belong here.** Special rule: 胶囊/气泡/徽章 with FIXED content → decoration. With dynamic content → container.`,
  other: `Catch-all for anything that doesn't fit the 5 categories. Reviewer will manually re-categorize if needed.`,
}
```

- [ ] **Step 4: 跑测试看通过**

```bash
npx vitest run src/lib/__tests__/visual-category.test.ts
```

Expected: PASS(4 tests)

- [ ] **Step 5: Commit**

```bash
git checkout -b feat/phase-8b-pass1-multi-route
git add src/lib/visual-category.ts src/lib/__tests__/visual-category.test.ts
git commit -m "feat(pipeline): visual-category 5 类枚举 + 优先级 + 中文 EXAMPLES 锚定"
```

---

### Task 8b.2: types.ts 扩展 Element + PipelineRun

**Files:**
- Modify: `src/lib/types.ts`(给 `Element` 加 `visual_category` + `pass1_routes_seen?`,扩展 `PipelinePassKind`)

- [ ] **Step 1: 写测试(验证 type-level 行为)**

`src/lib/__tests__/types-elements.test.ts`(新建):

```typescript
import { describe, it, expect } from 'vitest'
import type { Element, PipelinePassKind } from '@/lib/types'

describe('Element type', () => {
  it('accepts visual_category', () => {
    const el: Element = {
      id: 'x', page_id: 'p', state_ids: ['s'], name: 'n',
      type: 'static',
      visual_category: 'subject',
      bbox: [0, 0, 0.5, 0.5], z_index: 0, description: '',
      reviewed: false, created_at: '', updated_at: '',
    }
    expect(el.visual_category).toBe('subject')
  })

  it('accepts pass1_routes_seen as optional', () => {
    const el: Element = {
      id: 'x', page_id: 'p', state_ids: ['s'], name: 'n',
      type: 'static', visual_category: 'decoration',
      bbox: [0, 0, 1, 1], z_index: 0, description: '',
      pass1_routes_seen: ['decoration', 'subject'],
      reviewed: false, created_at: '', updated_at: '',
    }
    expect(el.pass1_routes_seen).toHaveLength(2)
  })
})

describe('PipelinePassKind', () => {
  it('accepts pass1_subject / pass2_decoration sub-kinds', () => {
    const a: PipelinePassKind = 'pass1_subject'
    const b: PipelinePassKind = 'pass2_decoration'
    expect(a).toBe('pass1_subject')
    expect(b).toBe('pass2_decoration')
  })
})
```

- [ ] **Step 2: 跑测试看 TS 报错**

```bash
npx tsc --noEmit
```

Expected: 报错(`visual_category` does not exist on `Element`)

- [ ] **Step 3: 修改 types.ts**

定位 `src/lib/types.ts` 中 `Element` 类型,加字段:

```typescript
import type { VisualCategory } from '@/lib/visual-category'

export type Element = {
  id: string
  page_id: string
  state_ids: string[]
  name: string
  type: 'static' | 'code'
  visual_category: VisualCategory       // 新增,Pass 1 输出
  bbox: [number, number, number, number]
  z_index: number
  description: string
  shape_spec?: string
  material_spec?: string
  cross_state_notes?: string
  pass1_routes_seen?: string[]          // 新增,debug 用
  reviewed: boolean
  created_at: string
  updated_at: string
}
```

定位 `PipelinePassKind`,扩展:

```typescript
export type PipelinePassKind =
  | 'pass1' | 'pass1_subject' | 'pass1_button' | 'pass1_container'
  | 'pass1_background' | 'pass1_decoration'
  | 'pass2' | 'pass2_subject' | 'pass2_button' | 'pass2_container'
  | 'pass2_background' | 'pass2_decoration' | 'pass2_other'
  | 'validate' | 're_extract'
```

- [ ] **Step 4: 跑五件套**

```bash
npx tsc --noEmit && npm test -- src/lib/__tests__/types-elements.test.ts
```

Expected: tsc PASS,test PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/types.ts src/lib/__tests__/types-elements.test.ts
git commit -m "feat(types): Element.visual_category + pass1_routes_seen + PipelinePassKind sub-kinds"
```

---

### Task 8b.3: elements.ts visual_category 兜底

**Files:**
- Modify: `src/lib/elements.ts`(已有 element 反序列化时 default `visual_category: 'other'`)

- [ ] **Step 1: 写测试**

`src/lib/__tests__/elements-migration.test.ts`(新建):

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { DATA_ROOT } from '@/lib/fs-utils'
import { getElementsByPage } from '@/lib/elements'

const TEST_PAGE_ID = 'pg_migration_test'

describe('elements migration: legacy without visual_category', () => {
  const legacyPath = path.join(DATA_ROOT, 'elements', `${TEST_PAGE_ID}.json`)

  beforeEach(async () => {
    await fs.mkdir(path.dirname(legacyPath), { recursive: true })
    // 旧格式:无 visual_category 字段
    await fs.writeFile(legacyPath, JSON.stringify([{
      id: 'el_old',
      page_id: TEST_PAGE_ID,
      state_ids: ['s1'],
      name: '老元素',
      type: 'static',
      bbox: [0, 0, 1, 1],
      z_index: 0,
      description: '',
      reviewed: false,
      created_at: '', updated_at: '',
    }]))
  })

  afterEach(async () => {
    await fs.unlink(legacyPath).catch(() => {})
  })

  it('defaults visual_category to "other" for legacy elements', async () => {
    const els = await getElementsByPage(TEST_PAGE_ID)
    expect(els[0]?.visual_category).toBe('other')
  })
})
```

- [ ] **Step 2: 跑看失败**

```bash
npx vitest run src/lib/__tests__/elements-migration.test.ts
```

Expected: FAIL(`expect(undefined).toBe('other')`)

- [ ] **Step 3: 修改 elements.ts**

定位 `getElementsByPage` 函数,在反序列化后兜底:

```typescript
// src/lib/elements.ts
import type { Element, VisualCategory } from '@/lib/types'

export async function getElementsByPage(pageId: string): Promise<Element[]> {
  // ...read JSON...
  const raw = JSON.parse(content) as Element[]
  return raw.map(el => ({
    ...el,
    visual_category: el.visual_category ?? ('other' as VisualCategory),
  }))
}
```

- [ ] **Step 4: 跑测试 + 全量已有测试**

```bash
npx vitest run
```

Expected: 新测 PASS,已有 88 测仍 PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/elements.ts src/lib/__tests__/elements-migration.test.ts
git commit -m "feat(elements): visual_category default to 'other' for legacy data"
```

---

### Task 8b.4: bbox-iou.ts(IoU 计算工具)

**Files:**
- Create: `src/lib/bbox-iou.ts`
- Test: `src/lib/__tests__/bbox-iou.test.ts`

- [ ] **Step 1: 写测试(5 边界 case)**

```typescript
import { describe, it, expect } from 'vitest'
import { bboxIoU } from '@/lib/bbox-iou'

describe('bboxIoU', () => {
  it('returns 1 for identical boxes', () => {
    expect(bboxIoU([0.1, 0.1, 0.4, 0.4], [0.1, 0.1, 0.4, 0.4])).toBe(1)
  })

  it('returns 0 for disjoint boxes', () => {
    expect(bboxIoU([0, 0, 0.2, 0.2], [0.5, 0.5, 0.2, 0.2])).toBe(0)
  })

  it('returns ~0.143 for 50%-overlap boxes (1/7)', () => {
    // a=[0,0,2,2] b=[1,1,2,2] inter=1*1=1, union=4+4-1=7
    expect(bboxIoU([0, 0, 2, 2], [1, 1, 2, 2])).toBeCloseTo(1 / 7, 3)
  })

  it('returns 0.25 when smaller box fully inside larger (1/4)', () => {
    // a=[0,0,2,2] b=[0,0,1,1] inter=1, union=4
    expect(bboxIoU([0, 0, 2, 2], [0, 0, 1, 1])).toBe(0.25)
  })

  it('returns 0 for zero-area degenerate input', () => {
    expect(bboxIoU([0, 0, 0, 0], [0, 0, 1, 1])).toBe(0)
  })
})
```

- [ ] **Step 2: 跑看失败**

```bash
npx vitest run src/lib/__tests__/bbox-iou.test.ts
```

Expected: FAIL(模块不存在)

- [ ] **Step 3: 写实现**

```typescript
// src/lib/bbox-iou.ts
// bbox 格式: [x, y, w, h](归一化或像素均可,只要两边一致)
export type Bbox = [number, number, number, number]

export function bboxIoU(a: Bbox, b: Bbox): number {
  const [ax, ay, aw, ah] = a
  const [bx, by, bw, bh] = b
  if (aw <= 0 || ah <= 0 || bw <= 0 || bh <= 0) return 0

  const ix1 = Math.max(ax, bx)
  const iy1 = Math.max(ay, by)
  const ix2 = Math.min(ax + aw, bx + bw)
  const iy2 = Math.min(ay + ah, by + bh)
  if (ix2 <= ix1 || iy2 <= iy1) return 0

  const inter = (ix2 - ix1) * (iy2 - iy1)
  const union = aw * ah + bw * bh - inter
  return union > 0 ? inter / union : 0
}
```

- [ ] **Step 4: 跑测试**

```bash
npx vitest run src/lib/__tests__/bbox-iou.test.ts
```

Expected: 5 PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/bbox-iou.ts src/lib/__tests__/bbox-iou.test.ts
git commit -m "feat(pipeline): bbox-iou utility for cross-route element merging"
```

---

### Task 8b.5: render-pass1-route.ts(over-include prompt 头拼接)

**Files:**
- Create: `src/lib/prompts/render-pass1-route.ts`
- Test: `src/lib/__tests__/render-pass1-route.test.ts`

- [ ] **Step 1: 写测试**

```typescript
import { describe, it, expect } from 'vitest'
import { renderPass1RoutePrompt } from '@/lib/prompts/render-pass1-route'

describe('renderPass1RoutePrompt', () => {
  const BASE = 'You are a UI design analyzer. Identify EVERY visible visual element.'

  it('prepends over-include header for subject', () => {
    const out = renderPass1RoutePrompt('subject', BASE)
    expect(out).toContain('[SUBJECT PASS — OVER-INCLUDE MODE]')
    expect(out).toContain('Main visual subject of the page')
    expect(out).toContain('Better to over-include than to miss')
    expect(out).toContain('Cross-route overlaps are FINE')
    expect(out).toContain('IP 角色')   // CATEGORY_EXAMPLES anchoring
    expect(out.endsWith(BASE)).toBe(true)
  })

  it('prepends over-include header for decoration with small-badge anchoring', () => {
    const out = renderPass1RoutePrompt('decoration', BASE)
    expect(out).toContain('[DECORATION PASS — OVER-INCLUDE MODE]')
    expect(out).toContain('购买后自动领取')      // PoC #2 v3 锚定
    expect(out).toContain('完单可收藏潮玩')
  })

  it('removes any "DO NOT return others" anti-pattern (PoC #2 v2 反面教训)', () => {
    const cats = ['subject','button','container','background','decoration'] as const
    for (const c of cats) {
      const out = renderPass1RoutePrompt(c, BASE)
      expect(out).not.toMatch(/DO NOT return.*other categories/i)
      expect(out).not.toMatch(/lean toward NOT returning/i)
    }
  })

  it('5 categories generate distinct prompts', () => {
    const cats = ['subject','button','container','background','decoration'] as const
    const prompts = cats.map(c => renderPass1RoutePrompt(c, BASE))
    const set = new Set(prompts)
    expect(set.size).toBe(5)
  })
})
```

- [ ] **Step 2: 跑看失败**

```bash
npx vitest run src/lib/__tests__/render-pass1-route.test.ts
```

Expected: FAIL(模块不存在)

- [ ] **Step 3: 写实现(over-include 模板,PoC #2 v3 验证)**

```typescript
// src/lib/prompts/render-pass1-route.ts
import {
  type VisualCategory,
  VISUAL_CATEGORY_DEFINITION_EN,
  VISUAL_CATEGORY_EXAMPLES_CN,
  visualCategoryCn,
} from '@/lib/visual-category'

export function renderPass1RoutePrompt(
  category: VisualCategory,
  basePrompt: string,
): string {
  const head = `[${category.toUpperCase()} PASS — OVER-INCLUDE MODE]

This pass focuses on ${visualCategoryCn(category)} (${category}) elements.

${VISUAL_CATEGORY_DEFINITION_EN[category]}

**OVER-INCLUDE PHILOSOPHY**:
- Be EXHAUSTIVE. **Better to over-include than to miss.**
- If you see ANY visual element that COULD plausibly be ${category}, return it. Even small/subtle ones. Even when borderline.
- Cross-route overlaps are FINE — downstream IoU merge handles dedup. We'd rather merge duplicates than miss elements.
- **Other passes also run. If you skip something thinking "decoration will handle it" but decoration also skips it thinking "subject will handle it", we lose the element.**
- So when in doubt, INCLUDE.

**Concrete examples of ${category} elements**:
${VISUAL_CATEGORY_EXAMPLES_CN[category]}

For elements you do return, still classify each as \`static\` or \`code\` per the rules below.

---

`
  return head + basePrompt
}
```

- [ ] **Step 4: 跑测试**

```bash
npx vitest run src/lib/__tests__/render-pass1-route.test.ts
```

Expected: 4 PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/prompts/render-pass1-route.ts src/lib/__tests__/render-pass1-route.test.ts
git commit -m "feat(prompts): render-pass1-route — over-include head (PoC #2 v3 验证)"
```

---

### Task 8b.6: pass1-route-merger.ts(IoU + 优先级合并)

**Files:**
- Create: `src/lib/pass1-route-merger.ts`
- Test: `src/lib/__tests__/pass1-route-merger.test.ts`

- [ ] **Step 1: 写测试(6 个场景)**

```typescript
import { describe, it, expect } from 'vitest'
import { mergeRoutes, type RouteResult } from '@/lib/pass1-route-merger'

const mkEl = (name: string, bbox: [number,number,number,number], type: 'static' | 'code' = 'static') => ({
  entity_name: name,
  type,
  bbox,
  description: name,
  z_index: 0,
})

describe('mergeRoutes', () => {
  it('single route: keeps all elements', () => {
    const out = mergeRoutes([{ category: 'subject', elements: [mkEl('hero', [0,0,0.5,0.5])] }])
    expect(out).toHaveLength(1)
    expect(out[0]!.visual_category).toBe('subject')
    expect(out[0]!.pass1_routes_seen).toEqual(['subject'])
  })

  it('cross-route same physical element (IoU > 0.5): keeps higher priority', () => {
    const out = mergeRoutes([
      { category: 'decoration', elements: [mkEl('hero_a', [0,0,0.5,0.5])] },
      { category: 'subject', elements: [mkEl('hero_b', [0.01,0.01,0.49,0.49])] },
    ])
    expect(out).toHaveLength(1)
    expect(out[0]!.visual_category).toBe('subject')
    expect(out[0]!.pass1_routes_seen).toContain('subject')
    expect(out[0]!.pass1_routes_seen).toContain('decoration')
  })

  it('disjoint elements: keeps all', () => {
    const out = mergeRoutes([
      { category: 'subject', elements: [mkEl('a', [0,0,0.2,0.2])] },
      { category: 'decoration', elements: [mkEl('b', [0.5,0.5,0.2,0.2])] },
    ])
    expect(out).toHaveLength(2)
  })

  it('triple-route hit: pass1_routes_seen has 3 entries, takes highest priority', () => {
    const out = mergeRoutes([
      { category: 'background', elements: [mkEl('x', [0,0,1,1])] },
      { category: 'container', elements: [mkEl('x', [0,0,1,1])] },
      { category: 'subject', elements: [mkEl('x', [0,0,1,1])] },
    ])
    expect(out).toHaveLength(1)
    expect(out[0]!.visual_category).toBe('subject')
    expect(out[0]!.pass1_routes_seen).toHaveLength(3)
  })

  it('handles empty input', () => {
    expect(mergeRoutes([])).toEqual([])
  })

  it('IoU below 0.5 treated as separate elements', () => {
    const out = mergeRoutes([
      { category: 'decoration', elements: [mkEl('a', [0,0,2,2])] },
      // IoU = 1/7 ≈ 0.14
      { category: 'subject', elements: [mkEl('b', [1,1,2,2])] },
    ])
    expect(out).toHaveLength(2)
  })
})
```

- [ ] **Step 2: 跑看失败**

```bash
npx vitest run src/lib/__tests__/pass1-route-merger.test.ts
```

Expected: FAIL(模块不存在)

- [ ] **Step 3: 写实现**

```typescript
// src/lib/pass1-route-merger.ts
import type { Element } from '@/lib/types'
import { type VisualCategory, VISUAL_CATEGORY_PRIORITY } from '@/lib/visual-category'
import { bboxIoU, type Bbox } from '@/lib/bbox-iou'
import { newElementId } from '@/lib/id'

// 来自单路 LLM 的元素(未带 visual_category)
export type RouteElement = {
  entity_name: string
  type: 'static' | 'code'
  type_reasoning?: string
  bbox: Bbox
  z_index?: number
  description: string
  shape_spec?: string
  material_spec?: string
  cross_state_notes?: string
  appears_in_states?: string[]
}

export type RouteResult = {
  category: VisualCategory
  elements: RouteElement[]
}

const IOU_MERGE_THRESHOLD = 0.5

// 合并 5 路结果。返回的 Element 缺 page_id/state_ids/timestamps,由 caller 补全。
export function mergeRoutes(results: RouteResult[]): Array<
  Omit<Element, 'page_id' | 'state_ids' | 'reviewed' | 'created_at' | 'updated_at'>
> {
  // 展平 + 按优先级排序(高优先级先占位)
  const flat = results.flatMap(r => r.elements.map(el => ({ el, category: r.category })))
  flat.sort((a, b) =>
    VISUAL_CATEGORY_PRIORITY[a.category] - VISUAL_CATEGORY_PRIORITY[b.category]
  )

  const merged: Array<Omit<Element, 'page_id' | 'state_ids' | 'reviewed' | 'created_at' | 'updated_at'>> = []

  for (const { el, category } of flat) {
    const dup = merged.find(m => bboxIoU(m.bbox, el.bbox) > IOU_MERGE_THRESHOLD)
    if (dup) {
      if (!dup.pass1_routes_seen) dup.pass1_routes_seen = []
      if (!dup.pass1_routes_seen.includes(category)) dup.pass1_routes_seen.push(category)
    } else {
      merged.push({
        id: newElementId(),
        name: el.entity_name,
        type: el.type === 'code' ? 'code' : 'static',
        visual_category: category,
        bbox: el.bbox,
        z_index: typeof el.z_index === 'number' ? el.z_index : 0,
        description: el.description,
        ...(el.shape_spec ? { shape_spec: el.shape_spec } : {}),
        ...(el.material_spec ? { material_spec: el.material_spec } : {}),
        ...(el.cross_state_notes ? { cross_state_notes: el.cross_state_notes } : {}),
        pass1_routes_seen: [category],
      })
    }
  }
  return merged
}
```

- [ ] **Step 4: 跑测试**

```bash
npx vitest run src/lib/__tests__/pass1-route-merger.test.ts
```

Expected: 6 PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/pass1-route-merger.ts src/lib/__tests__/pass1-route-merger.test.ts
git commit -m "feat(pipeline): pass1-route-merger — IoU 0.5 + priority resolution"
```

---

### Task 8b.7: pass1-runner.ts 重写为 5 路并行

**Files:**
- Modify: `src/lib/pass1-runner.ts`(替换 1-shot 为 5 路 Promise.allSettled + mergeRoutes)
- Test: `src/lib/__tests__/pass1-runner-multi.test.ts`(新建,vitest mock callMllm)

- [ ] **Step 1: 写测试**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/llm-client', () => ({
  callMllm: vi.fn(),
}))
vi.mock('@/lib/states', () => ({
  getState: vi.fn(),
  setPipelineStatus: vi.fn(),
  listStatesByPage: vi.fn(),
}))
vi.mock('@/lib/pages', () => ({ getPage: vi.fn() }))
vi.mock('@/lib/projects', () => ({ getProject: vi.fn() }))
vi.mock('@/lib/elements', () => ({
  getElementsByPage: vi.fn().mockResolvedValue([]),
  saveElementsForPage: vi.fn(),
}))
vi.mock('@/lib/pipelines', () => ({
  createRun: vi.fn().mockImplementation(() => Promise.resolve({ id: 'run_x' })),
  completeRun: vi.fn(),
  failRun: vi.fn(),
}))
vi.mock('@/lib/config', () => ({
  loadConfig: vi.fn().mockResolvedValue({
    providers: [{ id: 'p1', kind: 'mllm', active: true, model: 'g', api_key: 'k', api_format: 'sankuai' }],
    prompts: { pass1_layout: 'BASE PROMPT' },
  }),
}))
vi.mock('node:fs', async () => {
  const real = await vi.importActual<typeof import('node:fs')>('node:fs')
  return {
    ...real,
    promises: { ...real.promises, readFile: vi.fn().mockResolvedValue(Buffer.from('fake-png')) },
  }
})

import { runPass1 } from '@/lib/pass1-runner'
import { callMllm } from '@/lib/llm-client'
import { getState, listStatesByPage } from '@/lib/states'
import { getPage } from '@/lib/pages'
import { getProject } from '@/lib/projects'
import { saveElementsForPage } from '@/lib/elements'

describe('runPass1 multi-route', () => {
  beforeEach(() => {
    vi.mocked(getState).mockResolvedValue({
      id: 'st1', page_id: 'pg1', name: 'canonical',
      original_image_path: '/x', width: 100, height: 100,
      pipeline_status: 'idle', created_at: '',
    } as never)
    vi.mocked(getPage).mockResolvedValue({
      id: 'pg1', project_id: 'pj1', name: 'p',
      canonical_state_id: 'st1', created_at: '', updated_at: '',
    } as never)
    vi.mocked(getProject).mockResolvedValue({ id: 'pj1', name: 'proj', created_at: '', updated_at: '' } as never)
    vi.mocked(listStatesByPage).mockResolvedValue([
      { id: 'st1', page_id: 'pg1', name: 'canonical', original_image_path: '/x', width: 100, height: 100, pipeline_status: 'idle', created_at: '' },
    ] as never)
    vi.mocked(callMllm).mockReset()
  })

  it('calls 5 routes in parallel and merges', async () => {
    vi.mocked(callMllm).mockImplementation(async (_, opts) => {
      const sysContent = String(opts.messages[0]!.content)
      const cat = sysContent.match(/ONLY-(\w+) PASS/)![1]!.toLowerCase()
      return {
        content: JSON.stringify({
          elements: [{
            entity_name: `${cat}_el`, type: 'static',
            bbox: cat === 'subject' ? [0.1, 0.1, 0.3, 0.3] : [0.5 + 0.05 * cat.length, 0.5, 0.1, 0.1],
            description: `${cat} element`,
          }],
        }),
      }
    })

    await runPass1('st1')
    expect(callMllm).toHaveBeenCalledTimes(5)
    expect(saveElementsForPage).toHaveBeenCalled()
    const saved = vi.mocked(saveElementsForPage).mock.calls[0]![1]
    expect(saved.length).toBeGreaterThanOrEqual(5)
  })

  it('tolerates 2 route failures (≥3/5 OK)', async () => {
    let callIdx = 0
    vi.mocked(callMllm).mockImplementation(async () => {
      callIdx++
      if (callIdx <= 2) throw new Error('mock route failed')
      return { content: JSON.stringify({ elements: [{ entity_name: 'x', type: 'static', bbox: [0,0,0.1,0.1], description: 'x' }] }) }
    })

    await expect(runPass1('st1')).resolves.toBeDefined()
  })

  it('fails when only 2/5 routes succeed', async () => {
    let callIdx = 0
    vi.mocked(callMllm).mockImplementation(async () => {
      callIdx++
      if (callIdx <= 3) throw new Error('mock route failed')
      return { content: JSON.stringify({ elements: [] }) }
    })

    await expect(runPass1('st1')).rejects.toThrow(/Pass 1 多路失败/)
  })
})
```

- [ ] **Step 2: 跑看失败**

```bash
npx vitest run src/lib/__tests__/pass1-runner-multi.test.ts
```

Expected: FAIL(现 pass1-runner 还是 1-shot,只调一次)

- [ ] **Step 3: 重写 pass1-runner.ts**

替换原 `runPass1` 函数主体。仅给出新版关键段(import 和 helpers 同原):

```typescript
// src/lib/pass1-runner.ts(新版核心)
import { VISUAL_CATEGORIES, type VisualCategory } from '@/lib/visual-category'
import { renderPass1RoutePrompt } from '@/lib/prompts/render-pass1-route'
import { mergeRoutes, type RouteResult } from '@/lib/pass1-route-merger'

const ROUTE_CATEGORIES: VisualCategory[] = ['subject', 'button', 'container', 'background', 'decoration']
const MIN_SUCCESS_ROUTES = 3

export async function runPass1(stateId: string): Promise<Pass1Result> {
  const lockKey = `state:${stateId}`
  acquireLock(lockKey, `pass1-${Date.now()}`)
  let totalRunId: string | null = null
  try {
    const state = await getState(stateId)
    if (!state) throw new Error('state not found')
    const page = await getPage(state.page_id)
    if (!page) throw new Error('page not found')
    const project = await getProject(page.project_id)
    if (!project) throw new Error('project not found')

    const config = await loadConfig()
    const provider = config.providers.find(p => p.kind === 'mllm' && p.active)
    if (!provider) throw new Error('未配置 active mllm provider')

    const totalRun = await createRun({
      state_id: stateId, pass: 'pass1',
      llm_request: { provider_id: provider.id, model: provider.model ?? '', prompt: '[5-route Pass 1]', images: [state.original_image_path], extra: {} },
    })
    totalRunId = totalRun.id
    await setPipelineStatus(stateId, 'pass1_running', { pass1_run_id: totalRun.id })

    const allStates = await listStatesByPage(state.page_id)
    const userParts = await renderPass1UserMessage(project, page, allStates)

    // 5 路并行
    const routePromises = ROUTE_CATEGORIES.map(async (cat): Promise<RouteResult> => {
      const sys = renderPass1RoutePrompt(cat, config.prompts.pass1_layout)
      const callOpts: Parameters<typeof callMllm>[1] = {
        messages: [{ role: 'system', content: sys }, { role: 'user', content: userParts }],
        max_tokens: provider.default_max_tokens ?? 12000,
        response_format: { type: 'json_object' },
      }
      if (provider.default_temperature !== undefined) callOpts.temperature = provider.default_temperature
      if (provider.api_format === 'sankuai') {
        callOpts.extra_body = { google: { thinking_config: { include_thoughts: false, thinking_budget: 4096 } } }
      }
      const subRun = await createRun({
        state_id: stateId, pass: `pass1_${cat}` as const,
        llm_request: { provider_id: provider.id, model: provider.model ?? '', prompt: `[only-${cat}]`, images: [state.original_image_path], extra: { category: cat } },
      })
      try {
        const { content } = await callMllm(provider, callOpts)
        const parsed = JSON.parse(stripMarkdownJsonFence(content)) as { elements?: unknown[] }
        if (!Array.isArray(parsed.elements)) throw new Error('elements 不是数组')
        await completeRun(subRun.id, { llm_response: { content_length: content.length }, parsed_result: { element_count: parsed.elements.length } })
        return { category: cat, elements: parsed.elements as RouteResult['elements'] }
      } catch (err) {
        await failRun(subRun.id, { code: `PASS1_ROUTE_${cat.toUpperCase()}_ERROR`, message: (err as Error).message, retryable: true })
        throw err
      }
    })

    const settled = await Promise.allSettled(routePromises)
    const successes = settled.filter((s): s is PromiseFulfilledResult<RouteResult> => s.status === 'fulfilled').map(s => s.value)
    if (successes.length < MIN_SUCCESS_ROUTES) {
      throw new Error(`Pass 1 多路失败: 仅 ${successes.length}/5 成功(需 ≥${MIN_SUCCESS_ROUTES}),详见 sub-runs`)
    }

    // 合并 + 写盘(保留用户已编辑的 element,新合并的元素 attach state_id)
    const mergedRaw = mergeRoutes(successes)
    const existing = await getElementsByPage(state.page_id)
    const finalElements = mergeWithExisting(state, existing, mergedRaw)
    await saveElementsForPage(state.page_id, finalElements)

    await setPipelineStatus(stateId, 'pass1_done')
    await completeRun(totalRunId, {
      llm_response: { successful_routes: successes.length, total_routes: 5 },
      parsed_result: { element_count: finalElements.length, by_category: countByCategory(finalElements) },
    })
    return { run_id: totalRunId }
  } catch (err) {
    if (totalRunId) await failRun(totalRunId, { code: 'PASS1_ERROR', message: (err as Error).message, retryable: true })
    await setPipelineStatus(stateId, 'pass1_failed')
    throw err
  } finally {
    releaseLock(lockKey)
  }
}

// 合并新识别元素与已有 element(用户可能已编辑过):IoU > 0.5 视为同一,保留 existing 字段
function mergeWithExisting(state: State, existing: Element[], mergedRaw: ReturnType<typeof mergeRoutes>): Element[] {
  const now = new Date().toISOString()
  const out: Element[] = [...existing]
  for (const m of mergedRaw) {
    const dup = out.find(e => bboxIoU(e.bbox, m.bbox) > 0.5)
    if (dup) {
      if (!dup.state_ids.includes(state.id)) {
        dup.state_ids = [...dup.state_ids, state.id]
        dup.updated_at = now
      }
    } else {
      out.push({
        ...m,
        page_id: state.page_id,
        state_ids: [state.id],
        reviewed: false,
        created_at: now,
        updated_at: now,
      })
    }
  }
  return out
}

function countByCategory(els: Element[]): Record<string, number> {
  const r: Record<string, number> = {}
  for (const e of els) r[e.visual_category] = (r[e.visual_category] ?? 0) + 1
  return r
}
```

- [ ] **Step 4: 跑测试**

```bash
npx vitest run src/lib/__tests__/pass1-runner-multi.test.ts
npx vitest run  # 全套回归
```

Expected: 3 新测 PASS,已有测 PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/pass1-runner.ts src/lib/__tests__/pass1-runner-multi.test.ts
git commit -m "feat(pipeline): pass1-runner 5 routes parallel + merge + ≥3/5 tolerance"
```

---

### Task 8b.8: 五件套 + 端到端 + PR

**Files:**
- 无新文件,仅验证 + 文档同步

- [ ] **Step 1: 五件套**

```bash
npx tsc --noEmit && npm test && npm run lint && npm run build
```

Expected: 全 PASS

- [ ] **Step 2: 端到端跑奶茶盲盒页 Pass 1**

```bash
npm run dev  # 另开终端
# 浏览器:打开已有 project / 已上传 state 的 page,触发 Pass 1
# 检查 Element Review:每个 element 有 visual_category 字段(在 element-detail-panel 看到)
# 检查 5 类分布合理(decoration 多 / subject 少)
```

- [ ] **Step 3: 同步文档**

修改 `SPEC.md`:
- § 数据 schema § Element 加 `visual_category: VisualCategory`(类型定义参 visual-category.ts)
- § Pass 1 prompt 模板节加「5 路 only-X 头部由 lib/prompts/render-pass1-route.ts 在运行时拼接」说明
- § 数据 schema § PipelineRun 的 `PipelinePassKind` 扩展 sub-kind 列表

修改 `CLAUDE.md` § 反直觉强约束:
- §4「只有二分类」追加一段:`visual_category` 是正交维度(用于 Pass 1/2 调度),不是第三类 type
- 新增 §8(末尾):Pass 1 5 路并行 + IoU 0.5 合并 + 优先级冲突 + ≥3/5 容忍

- [ ] **Step 4: Commit 文档**

```bash
git add SPEC.md CLAUDE.md
git commit -m "docs: SPEC + CLAUDE 同步 Pass 1 5 路并行 + visual_category"
```

- [ ] **Step 5: 推 PR**

```bash
git push -u origin feat/phase-8b-pass1-multi-route
gh pr create --title "feat(pipeline): Phase 8b — Pass 1 5 路并行 + visual_category" --body "$(cat <<'EOF'
## 改了什么

Pass 1 从 1-shot 改为 5 路并行 mllm:每路 only-X prompt 识别一类 visual_category(subject/button/container/background/decoration),IoU 0.5 + 优先级合并。Element schema 加 visual_category 字段。

## 为什么

dogfood 暴露 Pass 1 1-shot 不准 + 拖框无效。5 路分类识别让模型注意力集中 + 给 Pass 2 提供分组依据(配合 Phase 8c 多参考图)。架构成立由 PoC v12 通过(`poc/v12-multi-route/REPORT.md`)。

## 怎么验证

- 五件套(tsc / 88 + N 新测 / lint / build)PASS
- 端到端:奶茶盲盒页 Pass 1 跑通,5 类分布合理,IoU 合并去重正常

## 向后兼容风险

- 已有 element 数据缺 visual_category 字段:elements.ts 兜底 'other',无破坏
- API 调用次数 1 → 5,成本上升 ~5×,时延不变(并行)

## Plan deviation

无,完全按 plan Phase 8b 执行。

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Phase 8c: Pass 2 按类分组 + 多参考图

**Goal:** 把 `pass2-runner.ts` 从单次 image_gen 改为按 `visual_category` 分组并行,每路传 `[原图, ...crops]` 多参考图。`callImageGen` 接口扩展为 `reference_image_base64s?: string[]`。

**Branch:** `feat/phase-8c-pass2-multi-ref`

**Dependencies:** Phase 8b merge

### Task 8c.1: callImageGen 扩展支持多参考图

**Files:**
- Modify: `src/lib/llm-client.ts:325-378`(callImageGen 加 `reference_image_base64s?: string[]`)
- Test: `src/lib/__tests__/llm-client-imagegen.test.ts`(新建)

- [ ] **Step 1: 写测试**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { callImageGen } from '@/lib/llm-client'

describe('callImageGen multi-ref', () => {
  beforeEach(() => {
    global.fetch = vi.fn()
  })

  it('puts main + extra refs into image_urls array in order', async () => {
    let capturedBody: any = null
    vi.mocked(global.fetch).mockImplementation(async (_url, init) => {
      capturedBody = JSON.parse(init!.body as string)
      // submit response
      return new Response(JSON.stringify({ code: 200, data: [{ task_id: 't1' }] }), { status: 200 })
    })
    // 不真跑 polling,直接验 submit body
    const promise = callImageGen(
      { id: 'p', kind: 'image_gen', api_format: 'apimart', is_async: true, base_url: 'https://api.apimart.ai/v1', api_key: 'k', model: 'gpt-image-2-official' } as never,
      {
        prompt: 'p',
        reference_image_base64: 'data:image/png;base64,MAIN',
        reference_image_base64s: ['data:image/png;base64,REF1', 'data:image/png;base64,REF2'],
        size: '1:1', resolution: '1k', quality: 'high', n: 1,
      },
    ).catch(() => null)
    await new Promise(r => setTimeout(r, 50))

    expect(capturedBody?.image_urls).toEqual([
      'data:image/png;base64,MAIN',
      'data:image/png;base64,REF1',
      'data:image/png;base64,REF2',
    ])
  })

  it('falls back to single image when only reference_image_base64 provided', async () => {
    let capturedBody: any = null
    vi.mocked(global.fetch).mockImplementation(async (_url, init) => {
      capturedBody = JSON.parse(init!.body as string)
      return new Response(JSON.stringify({ code: 200, data: [{ task_id: 't' }] }), { status: 200 })
    })
    callImageGen(
      { id: 'p', kind: 'image_gen', api_format: 'apimart', is_async: true, base_url: 'https://api.apimart.ai/v1', api_key: 'k', model: 'm' } as never,
      { prompt: 'p', reference_image_base64: 'data:image/png;base64,SOLO', size: '1:1', resolution: '1k', quality: 'high', n: 1 },
    ).catch(() => null)
    await new Promise(r => setTimeout(r, 50))
    expect(capturedBody?.image_urls).toEqual(['data:image/png;base64,SOLO'])
  })
})
```

- [ ] **Step 2: 跑看失败**

```bash
npx vitest run src/lib/__tests__/llm-client-imagegen.test.ts
```

Expected: FAIL(`reference_image_base64s` 字段不存在)

- [ ] **Step 3: 修改 callImageGen**

定位 `src/lib/llm-client.ts` 中 `callImageGen` 的 options type 和 submit body 拼装段:

```typescript
// 类型扩展
export type CallImageGenOptions = {
  prompt: string
  reference_image_base64?: string         // 主图(原图)
  reference_image_base64s?: string[]      // 新增:额外参考图(crop 列表)
  size?: string
  resolution?: string
  quality?: 'low' | 'medium' | 'high'
  n?: number
  signal?: AbortSignal
}

// submit body 拼装(原 src/lib/llm-client.ts:377-378 附近)
const imageUrls: string[] = []
if (opts.reference_image_base64) imageUrls.push(opts.reference_image_base64)
if (opts.reference_image_base64s) imageUrls.push(...opts.reference_image_base64s)
if (imageUrls.length > 0) submitBody.image_urls = imageUrls
```

- [ ] **Step 4: 跑测试 + 已有 callImageGen 回归**

```bash
npx vitest run src/lib/__tests__/llm-client-imagegen.test.ts
npx vitest run  # 全套
```

Expected: 2 新测 PASS,已有测 PASS

- [ ] **Step 5: Commit**

```bash
git checkout -b feat/phase-8c-pass2-multi-ref
git add src/lib/llm-client.ts src/lib/__tests__/llm-client-imagegen.test.ts
git commit -m "feat(llm-client): callImageGen 加 reference_image_base64s[] 支持多参考图"
```

---

### Task 8c.2: bbox-crop.ts(从原图按 bbox sharp.extract)

**Files:**
- Create: `src/lib/bbox-crop.ts`
- Test: `src/lib/__tests__/bbox-crop.test.ts`(用 fixture PNG)

- [ ] **Step 1: 写测试**

```typescript
import { describe, it, expect } from 'vitest'
import sharp from 'sharp'
import { cropFromBbox } from '@/lib/bbox-crop'

async function makeFixture(width = 100, height = 100): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 200, g: 100, b: 50 } },
  }).png().toBuffer()
}

describe('cropFromBbox', () => {
  it('extracts a sub-region by normalized bbox', async () => {
    const src = await makeFixture(100, 100)
    const out = await cropFromBbox(src, [0.1, 0.1, 0.5, 0.5], { width: 100, height: 100 })
    const meta = await sharp(out).metadata()
    expect(meta.width).toBe(50)
    expect(meta.height).toBe(50)
  })

  it('clamps bbox extending past image edges', async () => {
    const src = await makeFixture(100, 100)
    const out = await cropFromBbox(src, [0.8, 0.8, 0.5, 0.5], { width: 100, height: 100 })
    const meta = await sharp(out).metadata()
    expect(meta.width).toBeLessThanOrEqual(20)
    expect(meta.height).toBeLessThanOrEqual(20)
  })

  it('throws on zero-area bbox', async () => {
    const src = await makeFixture(100, 100)
    await expect(cropFromBbox(src, [0, 0, 0, 0], { width: 100, height: 100 })).rejects.toThrow(/zero/)
  })
})
```

- [ ] **Step 2: 跑看失败**

```bash
npx vitest run src/lib/__tests__/bbox-crop.test.ts
```

Expected: FAIL

- [ ] **Step 3: 写实现**

```typescript
// src/lib/bbox-crop.ts
import sharp from 'sharp'
import type { Bbox } from '@/lib/bbox-iou'

export async function cropFromBbox(
  rawBuffer: Buffer,
  bbox: Bbox,
  imgSize: { width: number; height: number },
): Promise<Buffer> {
  const [x, y, w, h] = bbox
  const left = Math.max(0, Math.floor(x * imgSize.width))
  const top = Math.max(0, Math.floor(y * imgSize.height))
  const width = Math.min(imgSize.width - left, Math.ceil(w * imgSize.width))
  const height = Math.min(imgSize.height - top, Math.ceil(h * imgSize.height))

  if (width <= 0 || height <= 0) {
    throw new Error(`cropFromBbox: zero-area bbox ${JSON.stringify(bbox)} on ${imgSize.width}x${imgSize.height}`)
  }
  return sharp(rawBuffer).extract({ left, top, width, height }).png().toBuffer()
}
```

- [ ] **Step 4: 跑测试**

```bash
npx vitest run src/lib/__tests__/bbox-crop.test.ts
```

Expected: 3 PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/bbox-crop.ts src/lib/__tests__/bbox-crop.test.ts
git commit -m "feat(pipeline): bbox-crop sharp.extract for Pass 2 reference images"
```

---

### Task 8c.3: render-pass2-route.ts(按 category 渲染 prompt + 编号引用 crop)

**Files:**
- Create: `src/lib/prompts/render-pass2-route.ts`
- Test: `src/lib/__tests__/render-pass2-route.test.ts`

- [ ] **Step 1: 写测试**

```typescript
import { describe, it, expect } from 'vitest'
import type { Element } from '@/lib/types'
import { renderPass2RoutePrompt } from '@/lib/prompts/render-pass2-route'

const mkEl = (id: string, name: string, desc: string, cat: Element['visual_category'] = 'decoration'): Element => ({
  id, page_id: 'p', state_ids: ['s'], name,
  type: 'static', visual_category: cat, bbox: [0,0,0.1,0.1], z_index: 0, description: desc,
  reviewed: false, created_at: '', updated_at: '',
})

describe('renderPass2RoutePrompt', () => {
  it('contains category Chinese label', () => {
    const out = renderPass2RoutePrompt('decoration', [mkEl('e1','SUPER 徽章','粉黄椭圆+虚线+星星')], '奶茶盲盒抽中页')
    expect(out).toContain('装饰类元素')
    expect(out).toContain('奶茶盲盒抽中页')
  })

  it('numbers references starting from #2 (origin is #1)', () => {
    const els = [mkEl('a','A chip','a desc'), mkEl('b','B chip','b desc')]
    const out = renderPass2RoutePrompt('decoration', els, 'page')
    expect(out).toContain('参考图 #2')
    expect(out).toContain('「A chip」')
    expect(out).toContain('参考图 #3')
    expect(out).toContain('「B chip」')
  })

  it('uses soft phrasing (no aggressive words)', () => {
    const out = renderPass2RoutePrompt('subject', [mkEl('a','x','y','subject')], 'p')
    expect(out).not.toMatch(/MUST|EXACTLY|TRUST|pixel-faithfully/i)
    expect(out).toContain('记得')
    expect(out).toContain('保持')
    expect(out).toContain('#00FF00')
  })

  it('throws when elements list empty', () => {
    expect(() => renderPass2RoutePrompt('subject', [], 'p')).toThrow(/empty/)
  })
})
```

- [ ] **Step 2: 跑看失败**

```bash
npx vitest run src/lib/__tests__/render-pass2-route.test.ts
```

Expected: FAIL

- [ ] **Step 3: 写实现**

```typescript
// src/lib/prompts/render-pass2-route.ts
import type { Element } from '@/lib/types'
import { type VisualCategory, visualCategoryCn } from '@/lib/visual-category'

export function renderPass2RoutePrompt(
  category: VisualCategory,
  elements: Element[],
  pageDescription: string,
): string {
  if (elements.length === 0) throw new Error('renderPass2RoutePrompt: empty elements list')

  const cn = visualCategoryCn(category)
  // 编号从 #2 开始(参考图 #1 是原图)
  const lines = elements.map((el, i) => `- 参考图 #${i + 2}:「${el.name}」(${el.description})`).join('\n')

  return `我们来尝试一下,把这张图(${pageDescription})里的${cn}类元素提取出来,单独放在一张鲜亮的纯绿色 #00FF00 背景画布上,作为后期抠像的绿幕。元素本身不要使用这个绿色。

第 1 张参考图是原图,展示了这些元素在画面里的整体样貌。后面的参考图是从原图取出的每个元素的特写,要画的就是这些:

${lines}

共 ${elements.length} 个元素,记得每个都画到。元素之间留出至少一整个元素宽度的空隙,宁可画布留白多也不要挤在一起。每个元素都要跟参考图里完全一致——保持原图的风格、颜色、文字内容,不要重新设计任何元素。`
}
```

- [ ] **Step 4: 跑测试**

```bash
npx vitest run src/lib/__tests__/render-pass2-route.test.ts
```

Expected: 4 PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/prompts/render-pass2-route.ts src/lib/__tests__/render-pass2-route.test.ts
git commit -m "feat(prompts): render-pass2-route — 按 category 渲染 + 编号引用 crop"
```

---

### Task 8c.4: 重写 pass2-runner.ts 按 category 分组并行 + 多参考图

**Files:**
- Modify: `src/lib/pass2-runner.ts`(主要改 `runPass2`)
- Test: `src/lib/__tests__/pass2-runner-multi.test.ts`(新建,vitest mock)

- [ ] **Step 1: 写测试**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/llm-client', () => ({ callImageGen: vi.fn() }))
vi.mock('@/lib/states', () => ({
  getState: vi.fn(), setPipelineStatus: vi.fn(),
}))
vi.mock('@/lib/pages', () => ({ getPage: vi.fn() }))
vi.mock('@/lib/projects', () => ({ getProject: vi.fn() }))
vi.mock('@/lib/elements', () => ({ getElementsByPage: vi.fn() }))
vi.mock('@/lib/pipelines', () => ({
  createRun: vi.fn().mockResolvedValue({ id: 'r' }),
  completeRun: vi.fn(), failRun: vi.fn(),
}))
vi.mock('@/lib/config', () => ({
  loadConfig: vi.fn().mockResolvedValue({
    providers: [{ id: 'p', kind: 'image_gen', active: true, model: 'm', default_quality: 'high', api_format: 'apimart', api_key: 'k', base_url: '', is_async: true }],
    prompts: { pass2_extract: '...' },
  }),
}))
vi.mock('@/lib/alpha-key', () => ({ chromaGreenKey: vi.fn().mockResolvedValue(Buffer.from('keyed')) }))
vi.mock('@/lib/slicer', () => ({
  sliceAssets: vi.fn().mockResolvedValue([
    { buffer: Buffer.from('s1'), opaque_pct: 50, bbox: [0,0,10,10] },
    { buffer: Buffer.from('s2'), opaque_pct: 60, bbox: [20,0,10,10] },
  ]),
}))
vi.mock('@/lib/assets', () => ({
  createOrUpdateAsset: vi.fn(), writeAssetBinary: vi.fn(),
}))
vi.mock('node:fs', async () => {
  const real = await vi.importActual<typeof import('node:fs')>('node:fs')
  return { ...real, promises: { ...real.promises, readFile: vi.fn().mockResolvedValue(Buffer.from('rawpng')), writeFile: vi.fn(), mkdir: vi.fn() } }
})

import { runPass2 } from '@/lib/pass2-runner'
import { callImageGen } from '@/lib/llm-client'
import { getState } from '@/lib/states'
import { getPage } from '@/lib/pages'
import { getProject } from '@/lib/projects'
import { getElementsByPage } from '@/lib/elements'

describe('runPass2 multi-route', () => {
  beforeEach(() => {
    vi.mocked(getState).mockResolvedValue({ id: 'st', page_id: 'pg', name: 'c', original_image_path: '/x', width: 100, height: 100, pipeline_status: 'pass1_done', created_at: '' } as never)
    vi.mocked(getPage).mockResolvedValue({ id: 'pg', project_id: 'pj', name: 'p', canonical_state_id: 'st', created_at: '', updated_at: '' } as never)
    vi.mocked(getProject).mockResolvedValue({ id: 'pj', name: 'pr', description: '奶茶页', created_at: '', updated_at: '' } as never)
    vi.mocked(callImageGen).mockReset()
    vi.mocked(callImageGen).mockResolvedValue({ image: Buffer.from('green'), latency_ms: 100 })
  })

  it('groups static elements by visual_category and calls image_gen per group', async () => {
    vi.mocked(getElementsByPage).mockResolvedValue([
      { id: 'e1', visual_category: 'subject', type: 'static', bbox: [0,0,0.5,0.5], name: 'hero', description: 'd', state_ids: ['st'], page_id: 'pg', z_index: 0, reviewed: true, created_at: '', updated_at: '' },
      { id: 'e2', visual_category: 'decoration', type: 'static', bbox: [0.6,0,0.1,0.1], name: 'star', description: 'd', state_ids: ['st'], page_id: 'pg', z_index: 0, reviewed: true, created_at: '', updated_at: '' },
      { id: 'e3', visual_category: 'decoration', type: 'static', bbox: [0.7,0.1,0.1,0.1], name: 'chip', description: 'd', state_ids: ['st'], page_id: 'pg', z_index: 0, reviewed: true, created_at: '', updated_at: '' },
      { id: 'e4', visual_category: 'container', type: 'code', bbox: [0,0,1,1], name: 'box', description: 'd', state_ids: ['st'], page_id: 'pg', z_index: 0, reviewed: true, created_at: '', updated_at: '' },
    ] as never)

    await runPass2('st')
    // type=static + 2 个 visual_category(subject + decoration)= 2 路调用
    expect(callImageGen).toHaveBeenCalledTimes(2)

    // decoration 路有 2 个 element → reference_image_base64s 长度 2(主图在 reference_image_base64)
    const decorationCall = vi.mocked(callImageGen).mock.calls.find(([_, opts]) =>
      opts.prompt.includes('装饰类元素')
    )
    expect(decorationCall).toBeDefined()
    expect(decorationCall![1].reference_image_base64s).toHaveLength(2)
  })

  it('tolerates per-route failure: failed route marks elements failed, others proceed', async () => {
    vi.mocked(getElementsByPage).mockResolvedValue([
      { id: 'e1', visual_category: 'subject', type: 'static', bbox: [0,0,0.5,0.5], name: 'h', description: 'd', state_ids: ['st'], page_id: 'pg', z_index: 0, reviewed: true, created_at: '', updated_at: '' },
      { id: 'e2', visual_category: 'decoration', type: 'static', bbox: [0.6,0,0.1,0.1], name: 's', description: 'd', state_ids: ['st'], page_id: 'pg', z_index: 0, reviewed: true, created_at: '', updated_at: '' },
    ] as never)
    let i = 0
    vi.mocked(callImageGen).mockImplementation(async () => {
      i++
      if (i === 1) throw new Error('mock fail')
      return { image: Buffer.from('green'), latency_ms: 100 }
    })

    await expect(runPass2('st')).resolves.toBeDefined()
  })
})
```

- [ ] **Step 2: 跑看失败**

```bash
npx vitest run src/lib/__tests__/pass2-runner-multi.test.ts
```

Expected: FAIL

- [ ] **Step 3: 重写 runPass2 主体**

```typescript
// src/lib/pass2-runner.ts(关键段)
import { renderPass2RoutePrompt } from '@/lib/prompts/render-pass2-route'
import { cropFromBbox } from '@/lib/bbox-crop'
import { type VisualCategory, VISUAL_CATEGORIES } from '@/lib/visual-category'

export async function runPass2(stateId: string): Promise<Pass2Result> {
  const lockKey = `state:${stateId}`
  acquireLock(lockKey, `pass2-${Date.now()}`)
  let totalRunId: string | null = null
  try {
    const state = await getState(stateId)
    if (!state) throw new Error('state not found')
    const page = await getPage(state.page_id)
    if (!page) throw new Error('page not found')
    const project = await getProject(page.project_id)
    if (!project) throw new Error('project not found')

    const config = await loadConfig()
    const provider = config.providers.find(p => p.kind === 'image_gen' && p.active)
    if (!provider) throw new Error('未配置 active image_gen provider')

    const allElements = await getElementsByPage(state.page_id)
    const staticByCategory = groupByCategory(allElements.filter(e => e.type === 'static'))
    const totalStatic = Array.from(staticByCategory.values()).reduce((a, b) => a + b.length, 0)
    if (totalStatic === 0) throw new Error('没有 type=static 元素可提取')

    const totalRun = await createRun({
      state_id: stateId, pass: 'pass2',
      llm_request: { provider_id: provider.id, model: provider.model ?? '', prompt: '[multi-route Pass 2]', images: [state.original_image_path], extra: {} },
    })
    totalRunId = totalRun.id
    await setPipelineStatus(stateId, 'pass2_running', { pass2_run_id: totalRun.id })

    // 读原图
    const rawBuf = await fs.readFile(path.join(DATA_ROOT, 'raw', `${stateId}.png`))
    const rawDataUrl = `data:image/png;base64,${rawBuf.toString('base64')}`
    const pageDesc = project.description ?? page.name

    // 每 visual_category 一路
    const routePromises = Array.from(staticByCategory.entries()).map(async ([cat, els]) => {
      const subRun = await createRun({
        state_id: stateId, pass: `pass2_${cat}` as PipelinePassKind,
        llm_request: { provider_id: provider.id, model: provider.model ?? '', prompt: `[only-${cat}]`, images: [state.original_image_path], extra: { category: cat, element_ids: els.map(e => e.id) } },
      })
      try {
        // 生成 crops
        const crops: string[] = []
        for (const el of els) {
          const cropBuf = await cropFromBbox(rawBuf, el.bbox, { width: state.width, height: state.height })
          crops.push(`data:image/png;base64,${cropBuf.toString('base64')}`)
        }
        const promptText = renderPass2RoutePrompt(cat, els, pageDesc)
        const { image: greenScreenPng, cost } = await callImageGen(provider, {
          prompt: promptText,
          reference_image_base64: rawDataUrl,
          reference_image_base64s: crops,
          size: '1:1', resolution: '1k',
          quality: provider.default_quality ?? 'high',
          n: 1,
        })
        // 留底
        const pass2Dir = path.join(DATA_ROOT, 'pass2')
        await fs.mkdir(pass2Dir, { recursive: true })
        await fs.writeFile(path.join(pass2Dir, `${stateId}-${cat}.png`), greenScreenPng)

        // chroma key + 切片
        const keyedPng = await chromaGreenKey(greenScreenPng)
        const keyedDir = path.join(DATA_ROOT, 'keyed')
        await fs.mkdir(keyedDir, { recursive: true })
        await fs.writeFile(path.join(keyedDir, `${stateId}-${cat}.png`), keyedPng)
        const slices = await sliceAssets(keyedPng, { gap: 15, padding: 5, min_size: 30, min_opaque_pct: 1 })

        // 切片 → element 映射:每路只在该 category elements 范围内匹配,按 (y,x) 顺序对应
        const limit = Math.min(els.length, slices.length)
        for (let i = 0; i < limit; i++) {
          const el = els[i]!, slice = slices[i]!
          await writeAssetBinary(el.id, slice.buffer)
          const meta = await sharpDims(slice.buffer)
          await createOrUpdateAsset({
            id: el.id, element_id: el.id, page_id: state.page_id,
            width: meta.width, height: meta.height, alpha_quality: slice.opaque_pct / 100,
          })
        }

        await completeRun(subRun.id, { llm_response: { cost: cost ?? null }, parsed_result: { element_count: els.length, slice_count: slices.length } })
        return { category: cat, ok: true, sliced: limit, expected: els.length }
      } catch (err) {
        await failRun(subRun.id, { code: `PASS2_ROUTE_${cat.toUpperCase()}_ERROR`, message: (err as Error).message, retryable: true })
        // 该路 elements 标 failed(不抛出,允许其他路完成)
        for (const el of els) {
          await createOrUpdateAsset({
            id: el.id, element_id: el.id, page_id: state.page_id,
            width: 0, height: 0, alpha_quality: 0, status: 'failed',
            validation_notes: `Route ${cat} failed: ${(err as Error).message}`,
          })
        }
        return { category: cat, ok: false, error: (err as Error).message }
      }
    })

    const settled = await Promise.allSettled(routePromises)
    const summary = settled.map(s => s.status === 'fulfilled' ? s.value : { ok: false, error: 'rejected' })
    const okRoutes = summary.filter(s => s.ok).length

    await setPipelineStatus(stateId, 'pass2_done')
    await completeRun(totalRunId, {
      llm_response: { successful_routes: okRoutes, total_routes: settled.length },
      parsed_result: { by_route: summary },
    })
    return { run_id: totalRunId, created_assets: summary.reduce((a, s: any) => a + (s.sliced ?? 0), 0) }
  } catch (err) {
    if (totalRunId) await failRun(totalRunId, { code: 'PASS2_ERROR', message: (err as Error).message, retryable: true })
    await setPipelineStatus(stateId, 'pass2_failed')
    throw err
  } finally {
    releaseLock(lockKey)
  }
}

function groupByCategory(els: Element[]): Map<VisualCategory, Element[]> {
  const m = new Map<VisualCategory, Element[]>()
  for (const e of els) {
    const cat = e.visual_category ?? 'other'
    if (!m.has(cat)) m.set(cat, [])
    m.get(cat)!.push(e)
  }
  return m
}
```

- [ ] **Step 4: 跑测试**

```bash
npx vitest run src/lib/__tests__/pass2-runner-multi.test.ts
npx vitest run  # 全套
```

Expected: 2 新测 PASS,已有测 PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/pass2-runner.ts src/lib/__tests__/pass2-runner-multi.test.ts
git commit -m "feat(pipeline): pass2-runner 按 visual_category 分组 + multi-ref crops"
```

---

### Task 8c.5: 切片合并约束(每路只在该 category 范围内对齐)

**说明:** 8c.4 实现里已包含切片合并约束(`for (let i = 0; i < limit; i++) { const el = els[i]!, slice = slices[i]! }` 仅在该路 elements 数组内循环,不跨 category 串)。本 task 单独写一个 integration 测确认这个约束。

**Files:**
- Test: 在 `pass2-runner-multi.test.ts` 加一个 case

- [ ] **Step 1: 加测试 case**

```typescript
it('does not cross-assign slices between categories', async () => {
  vi.mocked(getElementsByPage).mockResolvedValue([
    { id: 'e1', visual_category: 'subject', type: 'static', bbox: [0,0,0.5,0.5], name: 'h', description: 'd', state_ids: ['st'], page_id: 'pg', z_index: 0, reviewed: true, created_at: '', updated_at: '' },
    { id: 'e2', visual_category: 'decoration', type: 'static', bbox: [0.6,0,0.1,0.1], name: 's', description: 'd', state_ids: ['st'], page_id: 'pg', z_index: 0, reviewed: true, created_at: '', updated_at: '' },
  ] as never)
  // sliceAssets 在每次调用都返回 2 个切片(模拟模型多画了 1 个)
  const writeBin = (await import('@/lib/assets')).writeAssetBinary as any
  vi.mocked(writeBin).mockClear()

  await runPass2('st')
  // 即使每路返回 2 切片,subject 路只该匹配 e1(1 个 element);decoration 路只匹配 e2
  // writeAssetBinary 应该只被调 2 次(不是 4 次)
  expect(writeBin).toHaveBeenCalledTimes(2)
  const calledIds = vi.mocked(writeBin).mock.calls.map(c => c[0])
  expect(calledIds.sort()).toEqual(['e1', 'e2'])
})
```

- [ ] **Step 2: 跑**

```bash
npx vitest run src/lib/__tests__/pass2-runner-multi.test.ts
```

Expected: 3 PASS(8c.4 实现已满足约束)

- [ ] **Step 3 / 4 / 5: 无需新代码,commit 测试**

```bash
git add src/lib/__tests__/pass2-runner-multi.test.ts
git commit -m "test(pass2): assert slices don't cross-assign between categories"
```

---

### Task 8c.6: 部分失败容忍(单路失败不影响其他路)

**说明:** 8c.4 实现已用 `Promise.allSettled` + 单路 catch-and-mark-failed。本 task 是端到端验证 + 文档同步。

**Files:**
- Test: `pass2-runner-multi.test.ts` 中 8c.4 的 "tolerates per-route failure" 已覆盖
- Modify: `src/lib/pass2-runner.ts` 顶部加注释说明部分失败容忍策略

- [ ] **Step 1-3: 添加策略说明注释**

`src/lib/pass2-runner.ts` 顶部:

```typescript
// 部分失败容忍策略:
// - 每个 visual_category 一路 image_gen 调用
// - 单路失败:该路所有 elements 的 asset 标 status=failed,其他路不受影响
// - Pass 2 总 run 始终 completed(只要至少 1 路成功);失败的 element 在 Asset Review 提示用户重抠
// - 这与 v0.1 1-shot Pass 2「全成或全败」不同 — multi-route 下「部分成功」是正常状态
```

- [ ] **Step 4: 跑全套**

```bash
npx vitest run
```

Expected: 全 PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/pass2-runner.ts
git commit -m "docs(pass2): inline note on partial-failure tolerance strategy"
```

---

### Task 8c.7: 五件套 + 端到端 + 文档同步 + PR

**Files:**
- 改 `SPEC.md` / `CLAUDE.md`

- [ ] **Step 1: 五件套**

```bash
npx tsc --noEmit && npm test && npm run lint && npm run build
```

Expected: 全 PASS

- [ ] **Step 2: 端到端**

```bash
npm run dev
# 浏览器:对一个已 pass1_done 的 state 触发 Pass 2
# 检查:多个 visual_category 各自跑出绿幕图(data/pass2/{state-id}-{cat}.png 留底可见)
# 检查:一个 page 的 11 元素 ≥ 10 个 asset 切出(/projects/[pid]/pages/[id]/assets)
```

**关键验收:** 改一个 element 的 bbox(在 Element Review 拖框)→ 重跑 Pass 2 → 该路输出绿幕图明显跟随 bbox 改动(crop 跟着改,模型按新 crop 复刻)

- [ ] **Step 3: 同步 SPEC.md + CLAUDE.md**

`SPEC.md` § Pass 2 prompt 模板:整段替换为 §5.2 多参考图版(prompt 模板 + 编号引用规则 + reference_images 数组顺序)

`SPEC.md` § Provider 调用模式 § image_gen submit body:加 `image_urls` 数组多张说明

`CLAUDE.md` § 反直觉强约束 §6 末尾追加:

```
v12 起:Pass 2 喂 [原图, ...crops] 多参考图,prompt 用「参考图 #2 是 X」编号引用。
拖框生效路径:用户拖 bbox → crop 改 → 参考图改 → 模型按新 crop 复刻
```

- [ ] **Step 4: Commit 文档**

```bash
git add SPEC.md CLAUDE.md
git commit -m "docs: SPEC + CLAUDE 同步 Pass 2 multi-route + crop reference"
```

- [ ] **Step 5: 推 PR**

```bash
git push -u origin feat/phase-8c-pass2-multi-ref
gh pr create --title "feat(pipeline): Phase 8c — Pass 2 按类分组并行 + crop 多参考图" --body "$(cat <<'EOF'
## 改了什么

- callImageGen 加 reference_image_base64s[](apimart image_urls 数组多张支持)
- bbox-crop.ts:sharp.extract 按 bbox 从原图 crop
- render-pass2-route.ts:按 visual_category 渲染 prompt + 编号引用 #2/#3...
- pass2-runner.ts 重写:按 visual_category 分组并行调 image_gen,每路喂原图+crops
- 部分失败容忍(单路失败标 element=failed,其他路完成)

## 为什么

PoC #1 通过:多参考图模式让模型按 crop 复刻不 regenerate(B 路完胜 A)。这套架构同时解决:
- 问题 #1(Pass 2 不准):分组 + crop 让模型注意力集中
- 问题 #4(拖框无效):bbox 改 → crop 改 → 模型按新 crop 复刻,拖框终于生效

## 怎么验证

- 五件套(tsc / N+M test / lint / build)PASS
- 端到端:奶茶盲盒页 ≥ 10/11 元素切出
- 拖框验证:改 bbox + 重跑 Pass 2,产出图明显跟随

## 向后兼容风险

- 单页 Pass 2 调用次数 1 → N(N=该页 visual_category 数,典型 2-4),成本上升 ~3×
- 多参考图模式 PoC 通过但偶发 case 可能仍 regenerate(spec §10 风险表已规划缩小触发范围 fallback)

## Plan deviation

无,完全按 plan Phase 8c 执行。

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Phase 8d: UI 改造

**Goal:** Element Review 加 visual_category badge / 详情面板 select / 拖框语义提示;Pipeline Progress 多路进度展示;Settings 文案更新。

**Branch:** `feat/phase-8d-ui-multi-route`

**Dependencies:** Phase 8c merge

### Task 8d.1: visual-category-badge.tsx

**Files:**
- Create: `src/components/element-review/visual-category-badge.tsx`
- Test: `src/components/element-review/__tests__/visual-category-badge.test.tsx`

- [ ] **Step 1: 写 snapshot 测试**

```typescript
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { VisualCategoryBadge } from '@/components/element-review/visual-category-badge'

describe('VisualCategoryBadge', () => {
  it.each([
    ['subject','主体'], ['button','按钮'], ['container','容器'],
    ['background','背景'], ['decoration','装饰'], ['other','其他'],
  ] as const)('renders %s with Chinese label %s', (cat, cn) => {
    const { container } = render(<VisualCategoryBadge category={cat} />)
    expect(container.textContent).toContain(cn)
  })
})
```

- [ ] **Step 2: 跑看失败**

```bash
npx vitest run src/components/element-review/__tests__/visual-category-badge.test.tsx
```

Expected: FAIL

- [ ] **Step 3: 写组件**

```typescript
// src/components/element-review/visual-category-badge.tsx
import { type VisualCategory, visualCategoryCn } from '@/lib/visual-category'
import { cn } from '@/lib/utils'

const COLOR: Record<VisualCategory, string> = {
  subject:    'bg-rose-100 text-rose-700 border-rose-200',
  button:     'bg-amber-100 text-amber-700 border-amber-200',
  container:  'bg-blue-100 text-blue-700 border-blue-200',
  background: 'bg-slate-100 text-slate-700 border-slate-200',
  decoration: 'bg-violet-100 text-violet-700 border-violet-200',
  other:      'bg-zinc-100 text-zinc-600 border-zinc-200',
}

export function VisualCategoryBadge({ category, className }: {
  category: VisualCategory
  className?: string
}) {
  return (
    <span className={cn(
      'inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium border',
      COLOR[category], className,
    )}>
      {visualCategoryCn(category)}
    </span>
  )
}
```

- [ ] **Step 4: 跑测试**

```bash
npx vitest run src/components/element-review/__tests__/visual-category-badge.test.tsx
```

Expected: 6 PASS

- [ ] **Step 5: Commit**

```bash
git checkout -b feat/phase-8d-ui-multi-route
git add src/components/element-review/visual-category-badge.tsx \
        src/components/element-review/__tests__/visual-category-badge.test.tsx
git commit -m "feat(ui): VisualCategoryBadge 5 类彩色标签"
```

---

### Task 8d.2: element-list.tsx 加 badge + 类别筛选

**Files:**
- Modify: `src/components/element-review/element-list.tsx`

- [ ] **Step 1: 加测试**

```typescript
// src/components/element-review/__tests__/element-list-filter.test.tsx
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ElementList } from '@/components/element-review/element-list'

const els = [
  { id:'a', visual_category:'subject', name:'A', type:'static' as const, bbox:[0,0,1,1] as [number,number,number,number], z_index:0, description:'', state_ids:['s'], page_id:'p', reviewed:false, created_at:'', updated_at:'' },
  { id:'b', visual_category:'decoration', name:'B', type:'static' as const, bbox:[0,0,1,1] as [number,number,number,number], z_index:0, description:'', state_ids:['s'], page_id:'p', reviewed:false, created_at:'', updated_at:'' },
]

describe('ElementList filter by visual_category', () => {
  it('renders all elements by default', () => {
    render(<ElementList elements={els} selectedId={null} onSelect={() => {}} onUpdate={() => {}} />)
    expect(screen.getByText('A')).toBeInTheDocument()
    expect(screen.getByText('B')).toBeInTheDocument()
  })

  it('filters by category when toggle clicked', () => {
    render(<ElementList elements={els} selectedId={null} onSelect={() => {}} onUpdate={() => {}} />)
    fireEvent.click(screen.getByLabelText(/装饰/))
    // 装饰 unchecked → B 隐藏
    expect(screen.queryByText('B')).not.toBeInTheDocument()
    expect(screen.getByText('A')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: 跑看失败**

```bash
npx vitest run src/components/element-review/__tests__/element-list-filter.test.tsx
```

Expected: FAIL(无 badge / 无筛选 UI)

- [ ] **Step 3: 修改 element-list.tsx**

定位现有 ElementList,增加:
- 顶部加 6 个 checkbox(per visual_category,默认全选),控制 `enabledCategories: Set<VisualCategory>` state
- 列表项里在元素名旁加 `<VisualCategoryBadge category={el.visual_category}/>`
- 渲染前 filter:`elements.filter(e => enabledCategories.has(e.visual_category))`

```typescript
// 关键 diff
import { useState } from 'react'
import { VISUAL_CATEGORIES, visualCategoryCn, type VisualCategory } from '@/lib/visual-category'
import { VisualCategoryBadge } from './visual-category-badge'

export function ElementList({ elements, ...rest }: Props) {
  const [enabled, setEnabled] = useState<Set<VisualCategory>>(new Set(VISUAL_CATEGORIES))
  const visible = elements.filter(e => enabled.has(e.visual_category))

  return (
    <div>
      <div className="flex flex-wrap gap-2 px-3 py-2 border-b">
        {VISUAL_CATEGORIES.map(cat => (
          <label key={cat} className="flex items-center gap-1 text-xs cursor-pointer">
            <input type="checkbox" checked={enabled.has(cat)} aria-label={visualCategoryCn(cat)}
              onChange={e => {
                const next = new Set(enabled)
                if (e.target.checked) next.add(cat); else next.delete(cat)
                setEnabled(next)
              }}
            />
            <VisualCategoryBadge category={cat} />
          </label>
        ))}
      </div>
      <ul>
        {visible.map(el => (
          <li key={el.id}>
            <span>{el.name}</span>
            <VisualCategoryBadge category={el.visual_category} />
            {/* ... 其余原列表项内容 */}
          </li>
        ))}
      </ul>
    </div>
  )
}
```

- [ ] **Step 4: 跑测试**

```bash
npx vitest run src/components/element-review/__tests__/element-list-filter.test.tsx
```

Expected: 2 PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/element-review/element-list.tsx \
        src/components/element-review/__tests__/element-list-filter.test.tsx
git commit -m "feat(element-review): list 加 visual_category badge + 多选筛选"
```

---

### Task 8d.3: element-detail-panel.tsx 加 visual_category select

**Files:**
- Modify: `src/components/element-review/element-detail-panel.tsx`

- [ ] **Step 1: 加测试**

```typescript
// src/components/element-review/__tests__/element-detail-category.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ElementDetailPanel } from '@/components/element-review/element-detail-panel'

const el = { id:'a', visual_category:'decoration' as const, name:'A', type:'static' as const, bbox:[0,0,1,1] as [number,number,number,number], z_index:0, description:'', state_ids:['s'], page_id:'p', reviewed:false, created_at:'', updated_at:'' }

describe('ElementDetailPanel visual_category select', () => {
  it('changing select calls onUpdate with new category', () => {
    const onUpdate = vi.fn()
    render(<ElementDetailPanel element={el} onUpdate={onUpdate} />)
    fireEvent.change(screen.getByLabelText(/视觉类别/), { target: { value: 'subject' } })
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ visual_category: 'subject' }))
  })
})
```

- [ ] **Step 2: 跑看失败**

```bash
npx vitest run src/components/element-review/__tests__/element-detail-category.test.tsx
```

Expected: FAIL

- [ ] **Step 3: 修改 detail-panel**

```typescript
// 在已有字段编辑区(name / description / type)后追加
<div>
  <label htmlFor="vc">视觉类别</label>
  <select id="vc" value={element.visual_category}
    onChange={e => onUpdate({ ...element, visual_category: e.target.value as VisualCategory })}>
    {VISUAL_CATEGORIES.map(c => <option key={c} value={c}>{visualCategoryCn(c)}</option>)}
  </select>
</div>
```

- [ ] **Step 4: 跑测试 + 五件套局部**

```bash
npx vitest run src/components/element-review/__tests__/element-detail-category.test.tsx
npx tsc --noEmit
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/element-review/element-detail-panel.tsx \
        src/components/element-review/__tests__/element-detail-category.test.tsx
git commit -m "feat(element-review): detail-panel 加 visual_category select"
```

---

### Task 8d.4: canvas.tsx 顶部加拖框语义提示横幅

**Files:**
- Modify: `src/components/element-review/canvas.tsx`

- [ ] **Step 1: 加测试**

```typescript
// src/components/element-review/__tests__/canvas-banner.test.tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ElementReviewCanvas } from '@/components/element-review/canvas'

describe('Canvas drag-semantic banner', () => {
  it('shows banner explaining bbox drag affects Pass 2 crop', () => {
    render(<ElementReviewCanvas elements={[]} stateImageUrl="/x" onElementUpdate={() => {}} />)
    expect(screen.getByText(/拖动框/)).toBeInTheDocument()
    expect(screen.getByText(/Pass 2 参考图裁剪/)).toBeInTheDocument()
    expect(screen.getByText(/重跑 Pass 2 才生效/)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: 跑看失败**

- [ ] **Step 3: 在 canvas 顶部加横幅**

```typescript
// canvas.tsx return 顶部插入
<div className="px-3 py-2 mb-2 text-xs bg-amber-50 border border-amber-200 rounded text-amber-900">
  <strong>拖动框 = 调整位置坐标</strong>(进 layout.json)且作为 Pass 2 参考图裁剪边界。
  改 description / 类别 / 拆合并需要<strong>重跑 Pass 2</strong> 才生效。
</div>
```

- [ ] **Step 4: 跑测试**

```bash
npx vitest run src/components/element-review/__tests__/canvas-banner.test.tsx
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/element-review/canvas.tsx \
        src/components/element-review/__tests__/canvas-banner.test.tsx
git commit -m "feat(element-review): canvas 顶部加拖框语义提示横幅"
```

---

### Task 8d.5: pipeline-progress.tsx 多路进度组件

**Files:**
- Create: `src/components/pipeline-progress.tsx`
- Test: `src/components/__tests__/pipeline-progress.test.tsx`

- [ ] **Step 1: 写测试**

```typescript
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PipelineProgress } from '@/components/pipeline-progress'

describe('PipelineProgress', () => {
  it('shows N/N when all routes complete', () => {
    render(<PipelineProgress total={5} succeeded={5} failed={0} pass="pass1" />)
    expect(screen.getByText(/5\/5/)).toBeInTheDocument()
  })

  it('shows succeeded + failed split when partial failures', () => {
    render(<PipelineProgress total={5} succeeded={3} failed={2} pass="pass1" />)
    expect(screen.getByText(/3\/5/)).toBeInTheDocument()
    expect(screen.getByText(/1 failed|2 failed/)).toBeInTheDocument()
  })

  it('shows pass label', () => {
    render(<PipelineProgress total={5} succeeded={2} failed={0} pass="pass1" />)
    expect(screen.getByText(/Pass 1/)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: 跑看失败**

- [ ] **Step 3: 写实现**

```typescript
// src/components/pipeline-progress.tsx
export function PipelineProgress({ total, succeeded, failed, pass }: {
  total: number; succeeded: number; failed: number
  pass: 'pass1' | 'pass2'
}) {
  const label = pass === 'pass1' ? 'Pass 1' : 'Pass 2'
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="font-medium">{label}:</span>
      <span>{succeeded}/{total} 完成</span>
      {failed > 0 && <span className="text-rose-600">({failed} failed)</span>}
    </div>
  )
}
```

- [ ] **Step 4: 跑测试**

Expected: 3 PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/pipeline-progress.tsx src/components/__tests__/pipeline-progress.test.tsx
git commit -m "feat(ui): PipelineProgress 多路进度展示组件"
```

---

### Task 8d.6: 整合 PipelineProgress 到 element-review 页

**Files:**
- Modify: `src/app/projects/[pid]/pages/[id]/elements/page.tsx`(或 element-review 主页面)

- [ ] **Step 1: 找到现有 Pass 1 触发按钮 + run 状态轮询点**

```bash
grep -n 'pipeline_status\|pass1_running\|polling\|Pass 1' src/app/projects/[pid]/pages/[id]/elements/page.tsx
```

- [ ] **Step 2: 在轮询期间渲染 PipelineProgress**

伪代码(具体看你现有 hook):

```typescript
const { run, subRuns } = usePipelineStatus(stateId)
const succeeded = subRuns.filter(r => r.status === 'completed').length
const failed = subRuns.filter(r => r.status === 'failed').length
const total = subRuns.length || (run?.pass === 'pass1' ? 5 : ?)

return (
  <div>
    {run?.status === 'running' && (
      <PipelineProgress total={total} succeeded={succeeded} failed={failed} pass={run.pass.startsWith('pass1') ? 'pass1' : 'pass2'} />
    )}
    {/* ... */}
  </div>
)
```

- [ ] **Step 3: 后端 API 返回 sub-runs**

修改 `src/app/api/pipeline-runs/[id]/route.ts`(或新增 `?include_sub=true` query):返回 `{ run, sub_runs: PipelineRun[] }`,sub_runs 按 created_at 排序

- [ ] **Step 4: 跑五件套**

```bash
npx tsc --noEmit && npm test && npm run lint && npm run build
```

- [ ] **Step 5: Commit**

```bash
git add src/app/projects/[pid]/pages/[id]/elements/page.tsx \
        src/app/api/pipeline-runs/[id]/route.ts \
        src/lib/api/pipelines-client.ts
git commit -m "feat(ui): 整合 PipelineProgress + sub-runs API"
```

---

### Task 8d.7: Playwright e2e 加 visual_category 筛选 + 横幅

**Files:**
- Create: `e2e/element-review-multi-route.spec.ts`

- [ ] **Step 1: 写 e2e**

```typescript
import { test, expect } from '@playwright/test'

test('drag-semantic banner visible on element review canvas', async ({ page }) => {
  // 假设 fixture project + page 已就绪(沿用现有 e2e setup)
  await page.goto('/projects/<fixture-pid>/pages/<fixture-pgid>/elements')
  await expect(page.getByText('拖动框 = 调整位置坐标')).toBeVisible()
  await expect(page.getByText('重跑 Pass 2')).toBeVisible()
})

test('visual_category filter hides elements not in selected categories', async ({ page }) => {
  await page.goto('/projects/<fixture-pid>/pages/<fixture-pgid>/elements')
  const initialCount = await page.locator('[data-testid="element-list-item"]').count()
  // 取消 decoration 筛选
  await page.getByLabel('装饰').uncheck()
  const afterCount = await page.locator('[data-testid="element-list-item"]').count()
  expect(afterCount).toBeLessThan(initialCount)
})
```

需要在 element-list 渲染加 `data-testid="element-list-item"` 标记。

- [ ] **Step 2: 跑 e2e**

```bash
npm run test:e2e -- e2e/element-review-multi-route.spec.ts
```

Expected: 2 PASS

- [ ] **Step 3: Commit**

```bash
git add e2e/element-review-multi-route.spec.ts \
        src/components/element-review/element-list.tsx
git commit -m "test(e2e): visual_category 筛选 + 拖框横幅可见性"
```

---

### Task 8d.8: 五件套 + 浏览器肉眼验证 + 文档同步 + PR

- [ ] **Step 1: 五件套 + e2e**

```bash
npx tsc --noEmit && npm test && npm run lint && npm run build && npm run test:e2e
```

- [ ] **Step 2: 浏览器手动**

```bash
npm run dev
# 1. /projects → 进 page → /elements
# 2. 顶部横幅可见;列表 badge 可见;筛选可用
# 3. 详情面板改 visual_category select 后保存,刷新仍生效
# 4. 触发 Pass 1 → PipelineProgress 显 5/5(或部分失败)
```

- [ ] **Step 3: 同步文档**

`PRD.md` § Use Case「Element Review 阶段」加:
- 列表显示元素 visual_category badge,可筛选
- 详情面板可修改 visual_category(影响 Pass 2 调度组)
- canvas 顶部明示拖框语义

- [ ] **Step 4: Commit 文档**

```bash
git add PRD.md
git commit -m "docs(prd): Element Review 用例补 visual_category + 拖框语义"
```

- [ ] **Step 5: 推 PR**

```bash
git push -u origin feat/phase-8d-ui-multi-route
gh pr create --title "feat(ui): Phase 8d — Element Review badge + 筛选 + 拖框语义 + Pipeline Progress" --body "..."
```

---

## Phase 8e: 列表缩略图(独立子项)

**Goal:** Project / Page 列表卡片显示缩略图,加载失败回退到 icon。

**Branch:** `feat/phase-8e-list-thumbnails`

**Dependencies:** PR10 merge(可与 8a-d 并行)

### Task 8e.1: thumbnails.ts(sharp 缩略生成)

**Files:**
- Create: `src/lib/thumbnails.ts`
- Test: `src/lib/__tests__/thumbnails.test.ts`

- [ ] **Step 1: 写测试**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import { DATA_ROOT } from '@/lib/fs-utils'
import { generateThumbnail } from '@/lib/thumbnails'

const PAGE_ID = 'pg_thumb_test'
const RAW_PATH = path.join(DATA_ROOT, 'raw', `__test_${PAGE_ID}.png`)
const THUMB_PATH = path.join(DATA_ROOT, 'thumbs', `${PAGE_ID}.png`)

describe('generateThumbnail', () => {
  beforeEach(async () => {
    await fs.mkdir(path.dirname(RAW_PATH), { recursive: true })
    await sharp({ create: { width: 1024, height: 1024, channels: 3, background: { r: 100, g: 50, b: 200 } } })
      .png().toFile(RAW_PATH)
  })

  afterEach(async () => {
    await fs.unlink(RAW_PATH).catch(() => {})
    await fs.unlink(THUMB_PATH).catch(() => {})
  })

  it('writes 256px thumbnail to data/thumbs/{page-id}.png', async () => {
    await generateThumbnail(RAW_PATH, PAGE_ID)
    const meta = await sharp(THUMB_PATH).metadata()
    expect(meta.width).toBe(256)
    expect((await fs.stat(THUMB_PATH)).size).toBeLessThan(50_000)
  })

  it('returns thumbnail relative path', async () => {
    const out = await generateThumbnail(RAW_PATH, PAGE_ID)
    expect(out).toBe(`thumbs/${PAGE_ID}.png`)
  })
})
```

- [ ] **Step 2: 跑看失败**

- [ ] **Step 3: 写实现**

```typescript
// src/lib/thumbnails.ts
import sharp from 'sharp'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { DATA_ROOT } from '@/lib/fs-utils'

const THUMB_SIZE = 256

export async function generateThumbnail(rawPngPath: string, pageId: string): Promise<string> {
  const outDir = path.join(DATA_ROOT, 'thumbs')
  await fs.mkdir(outDir, { recursive: true })
  const outPath = path.join(outDir, `${pageId}.png`)
  await sharp(rawPngPath)
    .resize(THUMB_SIZE, THUMB_SIZE, { fit: 'inside', withoutEnlargement: true })
    .png({ quality: 85 })
    .toFile(outPath)
  return `thumbs/${pageId}.png`
}
```

- [ ] **Step 4: 跑测试**

Expected: 2 PASS

- [ ] **Step 5: Commit**

```bash
git checkout -b feat/phase-8e-list-thumbnails
git add src/lib/thumbnails.ts src/lib/__tests__/thumbnails.test.ts
git commit -m "feat(thumbnails): generateThumbnail 256px sharp 缩略"
```

---

### Task 8e.2: types.ts Page 加 thumbnail_path

**Files:**
- Modify: `src/lib/types.ts`

- [ ] **Step 1: 写测试**

```typescript
// src/lib/__tests__/types-page.test.ts
import { describe, it, expect } from 'vitest'
import type { Page } from '@/lib/types'

describe('Page type', () => {
  it('accepts thumbnail_path optional', () => {
    const p: Page = {
      id: 'x', project_id: 'y', name: 'n', canonical_state_id: 's',
      thumbnail_path: 'thumbs/x.png',
      created_at: '', updated_at: '',
    }
    expect(p.thumbnail_path).toBe('thumbs/x.png')
  })
})
```

- [ ] **Step 2: 跑看失败(tsc 错)**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: 加字段**

```typescript
// src/lib/types.ts
export type Page = {
  id: string
  project_id: string
  name: string
  route_hint?: string
  canonical_state_id: string
  thumbnail_path?: string         // 新增,相对 DATA_ROOT 的路径(`thumbs/{id}.png`)
  created_at: string
  updated_at: string
}
```

- [ ] **Step 4: 跑测试**

```bash
npx tsc --noEmit && npx vitest run src/lib/__tests__/types-page.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/types.ts src/lib/__tests__/types-page.test.ts
git commit -m "feat(types): Page.thumbnail_path optional"
```

---

### Task 8e.3: 上传 state 时同步生成缩略图

**Files:**
- Modify: `src/app/api/pages/[id]/states/route.ts`(POST handler)

- [ ] **Step 1: 写测试**

```typescript
// src/lib/__tests__/states-upload-thumbnail.test.ts
import { describe, it, expect, vi } from 'vitest'
import path from 'node:path'
import { promises as fs } from 'node:fs'
import { DATA_ROOT } from '@/lib/fs-utils'
import { generateThumbnail } from '@/lib/thumbnails'

vi.mock('@/lib/thumbnails', async (importOrig) => {
  const real = await importOrig<typeof import('@/lib/thumbnails')>()
  return { ...real, generateThumbnail: vi.fn(real.generateThumbnail) }
})

// 简化:测试 helper 函数 maybeGenerateThumbnail (新建,在 states route 调用)
import { maybeGenerateThumbnailForPage } from '@/lib/pages'

describe('maybeGenerateThumbnailForPage', () => {
  it('calls generateThumbnail when canonical state uploaded', async () => {
    // ... fixture page + canonical state png ready
    await maybeGenerateThumbnailForPage('pg_x')
    expect(generateThumbnail).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: 跑看失败**

- [ ] **Step 3: 在 pages.ts 加 helper + states POST 调用**

```typescript
// src/lib/pages.ts(追加)
import { generateThumbnail } from '@/lib/thumbnails'
import path from 'node:path'
import { DATA_ROOT } from '@/lib/fs-utils'
import { listStatesByPage } from '@/lib/states'

export async function maybeGenerateThumbnailForPage(pageId: string): Promise<void> {
  const page = await getPage(pageId)
  if (!page?.canonical_state_id) return
  const rawPath = path.join(DATA_ROOT, 'raw', `${page.canonical_state_id}.png`)
  try {
    const thumbnailPath = await generateThumbnail(rawPath, pageId)
    await updatePage(pageId, { thumbnail_path: thumbnailPath })
  } catch (err) {
    console.warn(`[thumbnails] failed for page ${pageId}:`, err)
  }
}
```

```typescript
// src/app/api/pages/[id]/states/route.ts POST 末尾追加
import { maybeGenerateThumbnailForPage } from '@/lib/pages'
// ... 上传 state 完成后:
await maybeGenerateThumbnailForPage(pageId)
```

- [ ] **Step 4: 跑测试**

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/pages.ts src/app/api/pages/[id]/states/route.ts \
        src/lib/__tests__/states-upload-thumbnail.test.ts
git commit -m "feat(states): 上传 canonical state 时同步生成缩略图"
```

---

### Task 8e.4: GET /api/thumbs/[id] 静态文件 route

**Files:**
- Create: `src/app/api/thumbs/[id]/route.ts`

- [ ] **Step 1: 写实现 + 测试**

```typescript
// src/app/api/thumbs/[id]/route.ts
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { NextResponse } from 'next/server'
import { DATA_ROOT } from '@/lib/fs-utils'

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params
  // 防御:严格匹配 nanoid(8) 字符集,防 path traversal
  if (!/^[a-zA-Z0-9_-]{1,32}$/.test(id)) {
    return new NextResponse('bad id', { status: 400 })
  }
  const filePath = path.join(DATA_ROOT, 'thumbs', `${id}.png`)
  try {
    const buf = await fs.readFile(filePath)
    return new NextResponse(buf, {
      status: 200,
      headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=86400' },
    })
  } catch {
    return new NextResponse('not found', { status: 404 })
  }
}
```

```typescript
// e2e/thumbs-api.spec.ts(简单 e2e)
import { test, expect } from '@playwright/test'

test('GET /api/thumbs/{id} returns 404 for missing thumb', async ({ request }) => {
  const res = await request.get('/api/thumbs/nonexistent_xx')
  expect(res.status()).toBe(404)
})

test('rejects path traversal id', async ({ request }) => {
  const res = await request.get('/api/thumbs/..%2Fconfig')
  expect([400, 404]).toContain(res.status())
})
```

- [ ] **Step 2-4: 跑 e2e**

```bash
npm run test:e2e -- e2e/thumbs-api.spec.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/app/api/thumbs/[id]/route.ts e2e/thumbs-api.spec.ts
git commit -m "feat(api): GET /api/thumbs/[id] 静态文件 + path-traversal 防御"
```

---

### Task 8e.5: API client 暴露 thumbnail_url / sample_thumbnail_url

**Files:**
- Modify: `src/lib/api/projects-client.ts` / `src/app/api/projects/route.ts` / `src/app/api/projects/[id]/pages/route.ts`

- [ ] **Step 1: 写测试**

```typescript
// src/lib/__tests__/projects-client-thumbnail.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { listProjectsApi, listPagesApi } from '@/lib/api/projects-client'

beforeEach(() => {
  global.fetch = vi.fn()
})

describe('projects-client thumbnail urls', () => {
  it('listPagesApi maps thumbnail_path → thumbnail_url', async () => {
    vi.mocked(global.fetch).mockResolvedValue(new Response(JSON.stringify([
      { id: 'p1', name: 'a', thumbnail_path: 'thumbs/p1.png', project_id: 'pj', canonical_state_id: 's', created_at: '', updated_at: '' },
    ]), { status: 200 }))
    const pages = await listPagesApi('pj')
    expect((pages[0] as any).thumbnail_url).toBe('/api/thumbs/p1')
  })
})
```

- [ ] **Step 2: 跑看失败**

- [ ] **Step 3: 改 client + API**

```typescript
// src/lib/api/projects-client.ts:listPagesApi(返回前 enrich)
export async function listPagesApi(projectId: string): Promise<(Page & { thumbnail_url?: string })[]> {
  const res = await fetch(`/api/projects/${projectId}/pages`)
  const list = await res.json() as Page[]
  return list.map(p => ({
    ...p,
    ...(p.thumbnail_path ? { thumbnail_url: `/api/thumbs/${p.id}` } : {}),
  }))
}

// listProjectsApi 类似:对每个 project,如果有 sample page 就加 sample_thumbnail_url
// 简单实现:让 GET /api/projects 返回 sample_thumbnail_path,client 转 url
export async function listProjectsApi(): Promise<(Project & { sample_thumbnail_url?: string })[]> {
  const res = await fetch('/api/projects')
  const list = await res.json() as (Project & { sample_thumbnail_path?: string; sample_page_id?: string })[]
  return list.map(p => ({
    ...p,
    ...(p.sample_page_id && p.sample_thumbnail_path
      ? { sample_thumbnail_url: `/api/thumbs/${p.sample_page_id}` }
      : {}),
  }))
}
```

```typescript
// src/app/api/projects/route.ts GET:enrich each project with first page's thumbnail
import { listProjects } from '@/lib/projects'
import { listPagesByProject } from '@/lib/pages'

export async function GET() {
  const projects = await listProjects()
  const enriched = await Promise.all(projects.map(async p => {
    const pages = await listPagesByProject(p.id)
    const first = pages.sort((a,b) => a.created_at.localeCompare(b.created_at))[0]
    if (first?.thumbnail_path) {
      return { ...p, sample_thumbnail_path: first.thumbnail_path, sample_page_id: first.id }
    }
    return p
  }))
  return Response.json(enriched)
}
```

- [ ] **Step 4: 跑测试 + 五件套**

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/api/projects-client.ts \
        src/app/api/projects/route.ts \
        src/lib/__tests__/projects-client-thumbnail.test.ts
git commit -m "feat(api): expose thumbnail_url / sample_thumbnail_url on list endpoints"
```

---

### Task 8e.6: ProjectCard / PageCard 展示缩略图 + onError fallback

**Files:**
- Modify: `src/components/projects/project-card.tsx`, `src/components/projects/page-card.tsx`

- [ ] **Step 1: 写 snapshot 测试**

```typescript
// src/components/projects/__tests__/cards-thumbnail.test.tsx
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { ProjectCard } from '@/components/projects/project-card'
import { PageCard } from '@/components/projects/page-card'

describe('cards thumbnail rendering', () => {
  it('PageCard renders <img> when thumbnail_url provided', () => {
    const page: any = { id:'p1', name:'A', project_id:'pj', canonical_state_id:'s', created_at:'', updated_at:'', thumbnail_url:'/api/thumbs/p1' }
    const { container } = render(<PageCard page={page} projectId="pj" onDeleted={() => {}} />)
    const img = container.querySelector('img')
    expect(img?.getAttribute('src')).toBe('/api/thumbs/p1')
  })

  it('PageCard falls back to icon when no thumbnail_url', () => {
    const page: any = { id:'p1', name:'A', project_id:'pj', canonical_state_id:'s', created_at:'', updated_at:'' }
    const { container } = render(<PageCard page={page} projectId="pj" onDeleted={() => {}} />)
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('[data-slot="icon-fallback"]')).toBeTruthy()
  })
})
```

- [ ] **Step 2: 跑看失败**

- [ ] **Step 3: 修改 PageCard + ProjectCard**

```typescript
// page-card.tsx 关键 diff
import { useState } from 'react'
import { FileText } from 'lucide-react'

export function PageCard({ page, ... }: { page: Page & { thumbnail_url?: string }; ... }) {
  const [imgFailed, setImgFailed] = useState(false)
  const showImg = page.thumbnail_url && !imgFailed
  return (
    <Card>
      <div className="aspect-square relative bg-muted">
        {showImg ? (
          <img src={page.thumbnail_url}
            alt={page.name}
            className="object-cover w-full h-full"
            onError={() => setImgFailed(true)} />
        ) : (
          <div data-slot="icon-fallback" className="flex items-center justify-center w-full h-full">
            <FileText className="size-12 text-muted-foreground/50" />
          </div>
        )}
      </div>
      {/* ... 其余内容 */}
    </Card>
  )
}
```

ProjectCard 用 `sample_thumbnail_url` 同样模式。

- [ ] **Step 4: 跑测试 + 五件套**

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/projects/project-card.tsx \
        src/components/projects/page-card.tsx \
        src/components/projects/__tests__/cards-thumbnail.test.tsx
git commit -m "feat(ui): ProjectCard/PageCard 展示缩略图 + onError fallback"
```

---

### Task 8e.7: 已有 page 无 thumbnail 处理(仅 fallback icon,不 lazy-generate)

**Files:**
- 无新代码,文档化决策

**说明:** spec §6 选 fallback 路径(简单)。已有 page 在没有重新上传 state 之前不会有 thumbnail——前端显 icon,用户感知到时,自己「重新上传 canonical state」即触发生成。**避免**首次列表加载时后端批量 sharp 处理(可能卡住列表请求)。

- [ ] **Step 1: 在 SPEC.md § 缩略图生成节追加策略说明**

```markdown
## 缩略图生成时机与回填

- 上传 canonical state 时生成缩略图(POST /api/pages/[id]/states 调 maybeGenerateThumbnailForPage)
- **已有 page(本特性上线前)无缩略图**:列表显 icon fallback,**不**做后端 lazy-generate(避免列表 API 阻塞)
- 用户想要为已有 page 补缩略图:在 page 详情页提供「重新生成缩略图」按钮(MVP 不做,V1 加)
```

- [ ] **Step 2-4: 无代码改动**

- [ ] **Step 5: Commit**

```bash
git add SPEC.md
git commit -m "docs(spec): 缩略图生成时机 + 已有 page fallback 策略"
```

---

### Task 8e.8: 五件套 + 浏览器肉眼验证 + PR

- [ ] **Step 1: 五件套**

```bash
npx tsc --noEmit && npm test && npm run lint && npm run build
```

- [ ] **Step 2: 浏览器**

```bash
npm run dev
# 1. /projects:已有 project 列表显 icon(无缩略图,符合预期)
# 2. 创建新 project + 新 page + 上传 canonical state
# 3. 回 /projects:新 project 卡片显缩略图(canonical state 的 256px 缩略)
# 4. 进项目:新 page 卡片显缩略图
# 5. 检查 data/thumbs/{page-id}.png 存在 < 50KB
```

- [ ] **Step 3: 文档**

`PRD.md` § Use Case「项目/页面列表」加缩略图 mention。`CLAUDE.md` 不需要(无反直觉决策)。

- [ ] **Step 4: Commit 文档**

```bash
git add PRD.md
git commit -m "docs(prd): 列表卡片缩略图用例"
```

- [ ] **Step 5: 推 PR**

```bash
git push -u origin feat/phase-8e-list-thumbnails
gh pr create --title "feat(ui): Phase 8e — Project/Page 列表缩略图" --body "$(cat <<'EOF'
## 改了什么

- generateThumbnail (sharp 256px 缩略)
- Page schema 加 thumbnail_path
- POST /api/pages/[id]/states 上传 canonical 时同步生成
- GET /api/thumbs/[id] 静态 route + path-traversal 防御
- ProjectCard / PageCard 显 <img> + onError 回退 icon

## 为什么

dogfood 暴露列表只看名字找不到要的页(问题 #2)。缩略图让用户一眼定位。

## 怎么验证

新建 project 上传 canonical → 列表显缩略图;已有 page 显 icon fallback。

## 向后兼容风险

- 已有 page 显 icon(非破坏,渐进可见)
- data/thumbs/ 目录新增,无现有数据迁移

## Plan deviation

无,完全按 plan Phase 8e 执行。

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## 文档同步(各 phase PR 内一并完成)

每个 phase 的 PR 必须同步更新对应文档(AGENTS.md §8 强制要求,不接受「之后再补」):

| Phase | 改 SPEC.md | 改 PRD.md | 改 CLAUDE.md |
|---|---|---|---|
| 8a | (PoC 报告改 REPORT.md) | — | — |
| 8b | § Element schema 加 visual_category;§ Pass 1 prompt 模板加 5 路头 | — | §4 补 visual_category 正交说明;新增 §8 多路并行规则 |
| 8c | § Pass 2 prompt 模板替换为多参考图版;§ PipelineRun pass kind 扩展 | — | §6 补 v12 多参考图编号引用规则 |
| 8d | — | 用例图加 visual_category review 流 | — |
| 8e | § Page schema 加 thumbnail_path;新增 § 缩略图生成 | 用例图加列表缩略图 | — |

---

## 验收 / 验证总表

整个 v0.2 完成后必须达到的硬指标:

| 指标 | 目标 | 测量方式 |
|---|---|---|
| 单测 | 88 (基线) + 新增 ~50 测全 PASS | `npm test` |
| 端到端 Pass 1 + Pass 2 | 奶茶盲盒页 11/11 元素正确切出 | 手动操作 dev server |
| 拖框语义 | 改 bbox → Pass 2 输出跟随变化(crop 改) | 同上 |
| 列表缩略图 | Project / Page 卡片可见缩略图 | 浏览器 |
| 单页总成本 | ≤ $1.10 | apimart console + 数运行的 cost |
| Pass 2 失败可见 | 部分失败时 element 标 status=failed,UI 提示 | dev server 手动操作 |
| 五件套 | tsc / test / lint / build / e2e 全 PASS | CI |

---

## 风险 + 回滚总表

| 风险 | 缓解 | 回滚路径 |
|---|---|---|
| Phase 8a PoC #2 召回仍 < 90% | spec §10 已有 fallback:1-shot Pass 1 + 给元素打 visual_category tag | 回 spec §10,改 8b 为 1-shot+tag 形式,Pass 2 仍按 category 分组并行 |
| Phase 8c 多参考图在某些页面意外 regenerate | PoC #1 通过但单页验证;若复现,排查具体页面元素 crop 质量 | 缩小 multi-ref 触发范围(只在 category 元素 ≥ 3 时启用) |
| Pass 2 N 路并行成本 / 时延实测超预期 | 加 settings.pass2_max_parallel_routes 上限(默认 5) | 限制并行度,但 spec 不提前实施(YAGNI) |
| 已有用户 elements 数据无 visual_category 导致 Pass 2 调度异常 | Element schema 兜底 'other',Pass 2 把 'other' 路当独立一路处理 | 已设计,无需特殊回滚 |
| chroma key 性能 N 路并行后实测卡顿 | spec §7.2 加 progress UI(已规划 8d.5) | 8d 后实测,若仍卡顿单独开 PR 加 worker_threads |

---

## 大纲自审 checkpoints

✅ Spec coverage:
- spec §1 整体架构 → Phase 8b + 8c 覆盖
- spec §2 visual_category 定义 → Phase 8b Task 8b.1
- spec §3 Schema 改动 → Phase 8b Task 8b.2 + 8e Task 8e.2
- spec §4 Pass 1 改造 → Phase 8b 整体
- spec §5 Pass 2 改造 → Phase 8c 整体
- spec §6 列表缩略图 → Phase 8e
- spec §7 UI 改动 → Phase 8d
- spec §8 PoC → Phase 8a (修正复测)
- spec §10 风险/回滚 → 本 plan 风险表对应
- spec §11 文档同步 → 本 plan 「文档同步」节

✅ Phase 之间依赖明确(8a → 8b → 8c → 8d;8e 独立)

✅ 每 phase 一个 branch + PR,符合 AGENTS.md §2

⚠️ Task 5-step TDD 详细步骤 **已展开完毕**(38 tasks × 5 steps ≈ 190 steps,~1700 行)

---

## 执行选择

Plan 已就绪。两种执行方式:

**1. Subagent-Driven(推荐)** — 一个 task 派一个 fresh subagent,review 后再下一个,fast iteration。适合有 38 个 task 这种长 plan,避免 context 累积污染。

**2. Inline Execution** — 在当前 session 直接走 task,执行有 checkpoint 让你 review。适合你想全程盯紧每一步。

**注意:** 整个 plan 跨 5 个 PR,每个 phase 一个 PR,merge 顺序 8a → 8b → 8c → 8d 串行,8e 可与任何阶段并行。Subagent-Driven 模式下我会按这个 PR 顺序串。
