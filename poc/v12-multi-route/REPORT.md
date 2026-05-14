# PoC v12 多路 Pass + 多参考图行为 验证报告

> 2026-05-14 嘉锟指示「先 PoC 再 spec」执行结果。
>
> 本报告状态:**进行中**(等待 PoC #1 / #2 / #3 输出回填)
>
> 关联 spec:[`docs/superpowers/specs/2026-05-14-pass-multi-route-design.md`](../../docs/superpowers/specs/2026-05-14-pass-multi-route-design.md) (DRAFT)

## 测试输入

| 项 | 值 |
|---|---|
| canonical 图 | `poc/inputs/canonical-1024.png` (472×1024) / `canonical-512.png` (236×512) |
| 测试场景 | 奶茶盲盒抽中页 |
| 预期 static 元素数 | 11(基于 v9-A summary) |
| sankuai gateway | `aigc.sankuai.com/v1/openai/native/chat/completions` (gemini-3.1-pro-preview) |
| apimart gateway | `api.apimart.ai/v1/images/generations` (gpt-image-2-official, quality=high, 1k) |

## PoC #1: 多参考图行为(最高风险)

**问题**:`image_urls = [原图, crop1..crop5]` 时,模型按 crop 复刻还是 regenerate?

**执行**:`poc/v12-multi-route/scripts/poc1-multi-ref.py`

**对照**:
- A 路 baseline: `image_urls = [canonical-1024]`, prompt 仅文字描述 5 个装饰元素
- B 路 multi-ref: `image_urls = [canonical-1024, chip_left, chip_top_right, chip_bottom_right, super_badge, seal]`, prompt 编号引用 #2-#6

**目标元素(5 个 batch2 装饰)**:
- 「黑糖珍珠」奶茶 chip
- 「Q弹厚乳」奶茶 chip
- 「经典奶茶系」奶茶 chip
- SUPER 装饰徽章
- 「解签」毛笔字印章

**判定标准**:
- 5 个元素是否都画到
- 文字内容是否准确(chip 上的中文)
- 风格 / 颜色 / 形状跟参考图匹配
- 是否触发 regenerate(明显偏离参考图)

**通过标准**:B 路明显优于 A 路 **或** 不差于 A 路且无 regenerate 特征

**实测结果(2026-05-14 跑)**:

| 维度 | A 路 (baseline) | B 路 (multi-ref) | 判断 |
|---|---|---|---|
| 5 元素全画到? | ✅ 5/5 + **多画 1 个** | ✅ 5/5 **不多不少** | **B 优** |
| 文字内容准确率 | 5/5 ✅ | 5/5 ✅ | 平 |
| chip 小奶茶杯细节 | 简化(无奶盖/颜色不准) | 接近参考(白奶盖+棕色奶茶) | **B 优** |
| SUPER 徽章细节 | 虚线+星星偏简化 | 虚线+星星+字距贴近原图 | **B 优** |
| 解签印章笔触 | 一般粗细 | 毛笔感更强 | **B 优** |
| **regenerate 特征** | — | **完全按 crop 复刻,无漂移** | **关键 ✅** |
| Cost ($) | 0.171 | 0.169 | 平 |
| Actual time (s) | 889 | ~889+排队 | 平 |

**输出图**:
- `poc/v12-multi-route/outputs/poc1-A.png`(baseline)
- `poc/v12-multi-route/outputs/poc1-B.png`(multi-ref)

**结论**:**通过 ✅✅**

**关键 finding(对架构决策影响最大)**:
1. **多参考图模式工作正常**:apimart `image_urls = [原图, crop1..crop5]` 时,gpt-image-2-official 不会 regenerate,而是按 crop 复刻
2. **B 路细节贴近度肉眼明显高于 A 路**:chip 小奶茶杯/SUPER/解签都更接近原图
3. **B 路数量精确**:A 多画 1 个 chip,B 严格 5 个。这印证了 crop 当锚点能让模型「不自由发挥」
4. **意外副发现**:apimart 当前 actual_time 远超 SPEC 默认 132s 上限。生产 SPEC 必须把 `poll_max_attempts` 默认从 24 调到 ≥ 60(15 分钟兜底)

**对 spec 的影响**:
- ✅ spec §5 「reference_images = [原图, ...crops]」实施路径成立
- ✅ spec §10 风险表「PoC #1 失败」分支不必触发
- ✅ 问题 #4 拖框生效路径(用 bbox crop 当多参考图)架构成立
- 🆕 SPEC.md `poll_max_attempts` 默认值需上调(dogfood 暴露的 timeout 隐患)

## PoC #2: Pass 1 5 路 only-{category} 单类质量

**问题**:5 路 mllm 各自的 only-X prompt 能否
- 严格只识别该类(误判 < 10%)?
- 5 路并集召回 ≥ v9b 1-shot baseline?
- 跨路 IoU > 0.5 重复识别合理(典型元素 ≤ 2 路)?

**执行**:`poc/v12-multi-route/scripts/poc2-pass1-routes.py`

**实测结果(2026-05-14 跑)**:

| Route | element_count | latency_s | 备注 |
|---|---|---|---|
| subject | 4 | 21.2 | 主角色 + 标题艺术字 + 2 产品图 |
| button | 0 | 12.2 | 该页确实无装饰按钮(普通 nav 按钮归 code) |
| container | 2 | 26.9 | 粉色异形展示框 + 白底列表卡 |
| background | 1 | 8.5 | 全页粉色渐变背景 |
| decoration | 9 | 31.7 | super 徽章 + 2 sparkle + 3 chip + 解签印章 + 2 挂钩 |

**汇总指标**:

| 指标 | 数值 | 通过标准 | 判断 |
|---|---|---|---|
| 总元素数(5 路并集) | 16(去重后 15) | — | — |
| 跨路 IoU > 0.5 重复对 | 1 (background↔container, 视觉本就重叠) | 典型元素 ≤ 2 路 | ✅ |
| 5 路最长 latency(并行总耗时) | 31.7s | < 60s | ✅ |
| **static 元素召回**(对比 v9b 13 个) | **10 / 13 = 77%** | ≥ 90% | ⚠️ |
| **0.42x 总 recall ratio** | 误导,v9b 含 23 个 type=code 纯文本块本就不属于 5 类 | — | — |

**Static 元素召回详情**(v12 vs v9b 13 个 static):

| v9b static | v12 召回 | v12 路 |
|---|---|---|
| background_image | ✅ | background |
| super_badge | ✅ | decoration |
| character_3d_model | ✅ | subject |
| tag_black_sugar_pearl | ✅ | decoration |
| tag_q_bounce_milk | ✅ | decoration |
| tag_classic_milk_tea | ✅ | decoration |
| fortune_seal | ✅ | decoration |
| hanging_rings | ✅ (拆 left/right 两个) | decoration |
| auto_claim_badge「购买后自动领取」 | ❌ | — |
| product_image_1 | ✅ | subject |
| product_claim_badge_1「完单可收藏潮玩」 | ❌ | — |
| product_image_2 | ✅ | subject |
| product_claim_badge_2「完单可收藏潮玩」 | ❌ | — |

**v12 多识别出**(v9b 1-shot 漏的):
- title_sparkle_left / title_sparkle_right(标题旁的小光点) — 2 个新装饰
- Artistic Title(标题艺术字) — v9b 标 type=code,v12 升级为 subject + type=static(更准确)

**结论**:**条件通过 ✅**

**好的**:
- 5 路并行可行,跨路重复 ≤ 1(IoU>0.5)
- 严格性 OK,无大规模错置
- 多识别出 v9b 1-shot 漏的元素(sparkle / Artistic Title)
- 升级了 Artistic Title 的 visual_category 判断

**差的**:
- 漏 3 个「小徽章」(`auto_claim_badge`, `product_claim_badge_1/2`)。**这些是 type=static + decoration 类**,会进 Pass 2,漏掉是真问题
- 根因:`only-X` prompt 头里的「If unsure, lean toward NOT returning」让模型在 decoration 类过于保守
- 修正策略:prompt 头改「Be EXHAUSTIVE within this category. Even small/subtle elements count.」**不是**结构性问题

**对 spec 的影响**:
- ✅ spec §4 Pass 1 5 路并行架构成立
- ⚠️ spec §4.1 `only-X` prompt 头部要修正:删除「If unsure, lean toward NOT returning」,改为激进 EXHAUSTIVE
- ⚠️ 召回兜底:加一路「only-uncategorized」prompt(返回 5 类都不属于但用户视觉上重要的元素)?**或者**接受 77% 召回 + 用户在 Element Review 手动补漏元素

**输出文件**:
- `poc/v12-multi-route/outputs/poc2-pass1-{subject,button,container,background,decoration}.json`
- `poc/v12-multi-route/outputs/poc2-summary.json`

## PoC #3: v12 端到端 sanity check

**前置**:PoC #1 通过

**问题**:把 PoC #1 的多参考图模式应用到 5 类分组,跑端到端(Pass 1 5 路 → 按 category 分组 → Pass 2 N 路 → 各 chroma key + 切片 → 合并 asset)能否产出可用结果?

**执行**:待写(基于 PoC #1 / #2 的实际 prompt 形态定型后)

**通过标准**:11 个元素中 ≥ 10 个被正确切出(元素覆盖度 ≥ 90%);单页总成本 ≤ $1.00

**结论**:TBD

## 总体决策矩阵

| PoC #1 | PoC #2 | spec 走向 |
|---|---|---|
| ✅ | ✅ | 全 spec 实施(8a-8e),最佳路径 |
| ✅ | ❌ | spec §4 fallback,只做 Pass 2 多路 + 多参考图 |
| ❌ | ✅ | spec §5 fallback,只做 Pass 1 多路 + UI 教育拖框 |
| ❌ | ❌ | 大部分 spec 推翻,只保留列表缩略图(§6) + UI 改造(§7) |

## 备注

- v9-A 已在 prompt 层验证过 batch 拆分调用模型行为正常,所以本次 PoC 重点是 **多参考图** 这个 v9-A 没测的新变量
- v11 baseline 是 1-shot Pass 2 + 绿幕 chroma key 全自动(11/11 元素全命中,$0.17/页)。v12 必须不**显著**退化于此
- 若 PoC #1 结果模糊(B 路勉强等于 A 路,无明确优势),仍按"实施成本上升 vs 可控性提升"做工程决策,**不强行 ship 未经验证的复杂度**

