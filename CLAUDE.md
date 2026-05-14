# img2UI

把 AI 生图设计稿(GPT-image-2 等产出的栅格化 PNG)转成 coding agent 可消费的素材包。本地 web app,Next.js + 文件系统 JSON,无独立后端

**项目还在设计阶段,代码尚未启动。**

## 第一次进项目?读这两份

| 我想了解... | 看这里 |
|---|---|
| 项目为什么存在 / 解决什么问题 / 用户是谁 / 怎么交互 | [`PRD.md`](./PRD.md) |
| 数据 schema / API 契约 / Pass 1+2 prompt 模板 / 文件结构 / 错误重试 | [`SPEC.md`](./SPEC.md) |
| 开发流程 / 分支 / PR / commit / AI 协议 | [`AGENTS.md`](./AGENTS.md) |

## 找东西?快速跳转(代码就位后填)

> 项目实现进入后再补这一节。下面是规划中的位置,实现时优先复用 evalyst 同名模块

| 我想找... | 规划位置 | 参考来源 |
|---|---|---|
| Provider 配置 CRUD + API key 双向 mask | `src/lib/llm-config.ts` + `/settings/{models,cdn}` | evalyst `src/lib/llm-config.ts` 几乎照搬,加 `kind: 'mllm'\|'image_gen'\|'cdn'` discriminator |
| LLM 调用统一封装(OpenAI/Anthropic/image_gen 分发 + 3 次 retry + 120s 超时) | `src/lib/llm-client.ts` | evalyst `src/lib/llm-client.ts` |
| Pass 1 / Pass 2 / 校验 / 切片 pipeline 主循环 | `src/lib/pipeline-runner.ts` | evalyst `src/lib/batch-runner.ts` |
| 文件原子写 + 并发锁 | `src/lib/fs-utils.ts`(`writeAtomic`)+ `src/lib/run-lock.ts` | evalyst `src/lib/fs-utils.ts` 直接抄 |
| CSRF gate | `src/middleware.ts` | evalyst `src/middleware.ts` 直接抄 |
| Sidebar / 顶层 layout / Provider 嵌套 | `src/app/layout.tsx` + `src/components/sidebar.tsx` | evalyst 同路径,删掉 Copilot 相关 |
| Element Review canvas(bbox 拖拽 + 叠加层) | `src/components/element-review/canvas.tsx` | 自己写,无现成参考 |
| Asset Review(透明 PNG 预览 + 切片网格) | `src/components/asset-review/*.tsx` | 自己写 |
| StickySaveBar / useConfirm | `src/components/ui/sticky-save-bar.tsx` + `confirm-dialog.tsx` | evalyst 直接搬 |
| API routes | `src/app/api/{config,projects,pages,states,pipeline-runs,assets,export}/route.ts` | evalyst REST 风格 |
| 数据持久化路径 | `data/{config.json, projects/, pages/, states/, elements/, assets/, pipelines/, raw/, pass2/, keyed/, assets-bin/}` | SPEC § 文件系统布局 |

## 反直觉强约束(每次进项目必读)

下面**七**条是产品迭代过程中**收敛后**的关键决策,新进项目的人(包括下次进来的我自己)很容易"看起来更合理就走错路"——把它们当硬约束读

### 1. 资产提取走 image-edit,**不**走"重新生成"

GPT-image-2 / 等价 image_edit 模型必须**接受原图作为输入**,做语义图层分离。**禁止**把单个元素的 description 喂进文本 to image 模型让它"重新生成一个"——会产生风格漂移(光影、视角、材质对不上原稿),拼回页面里违和。

正确路径:原图 + element 列表(每个有 description) → image-edit → 一张绿幕 PNG(所有元素互不重叠) → 本地 chroma key 抠出透明 PNG → scipy 切片

错误路径:原图 → 识别出元素 → 单独喂 prompt 重新生成单元素 → 抠图 → 拼回。**这条路看起来很合理但走不通。**

### 2. Pass 2 输出的透明 PNG **不要求**保留元素原坐标

提示工程时,**不要**让 GPT-image-2 把元素放在它们在原图中的位置。原因:原图里元素经常重叠(SUPER 标签压在标题角上、引线 chip 跟娃娃身体相切、解签印章盖在脚踝上),强行保位置会让重叠区域互相切片/渗色,提取不干净。

正确做法:让模型在透明画布上**自由排布、互不重叠**(网格或自然流式)。元素的真实位置坐标(用于 layout.json)来自 **Pass 1 的 bbox**,不是 Pass 2 的输出位置。两条 pass 完全解耦。

### 3. 异形容器(承载内容的盒子)是 `type=code`,**不要**抠图

举例:奶茶盲盒页面那个粉色异形外框,顶部有 notch、底部有圆孔、内部要装娃娃 + chip + 文字。**不要**把它整体抠成 PNG。理由:

- (a) 内容长度变化时盒子要响应式,PNG 撑不开
- (b) 异形边界(notch、圆孔)在响应式适配时一变就穿帮
- (c) 如果它有跟其他元素的视觉关联(挂钩、引线),baked 进 PNG 就死了

判别启发式(写进 Pass 1 prompt):**一个元素如果 (a) 内部包含其他被识别的元素,或 (b) 在多个状态下尺寸/形状会变,就是 `type=code`,必须输出 shape_spec / material_spec,coding agent 用 SVG path 或 CSS clip-path 实现**

### 4. MVP **只有二分类**:`static` / `code`,**禁止**引入第三类

设计讨论中曾提出"hybrid-container"作为第三类(异形容器拆解成 shape + material + 子元素)。**已被砍掉**。理由:LLM 能在二分类下吸收所有歧义——异形容器归 `code`,模型自行输出 shape_spec / material_spec / 子元素列表。多一个分类会让代码层凭空出现一个分支,违反 [[feedback-simple-architecture]] 的设计原则。

下次又有人想加 `hybrid` / `mixed` / `partial-static` 这种第三类,**先看能不能让 LLM 一次性处理掉,99% 情况下能**

**Phase 8b 补充**:`visual_category`(subject / button / container / background / decoration / other)是**正交于 type 的元数据维度**,**不是第三类 type**。它只用于 Pass 1 5 路并行调度 + Pass 2 按类分组(Phase 8c),不影响 type=static/code 的二分类。同一个 element 既有 `type: 'static' | 'code'`,也有 `visual_category: VisualCategory`,两者独立。下次想再加分类维度前,先问:能不能挂在 `visual_category` 下?如果能,扩展枚举即可,**不要**再加新维度。

### 5. Pass 1 **只出 bbox**,**不要** polygon outline

Pass 1 的 LLM 输出每个元素的 `bbox: [x,y,w,h]`,**不要**让它输出 polygon 顶点。理由:polygon 对 Pass 2 提取质量没有功能贡献(image-edit 模型不接受 polygon-aware 条件输入),纯 UX 辅助(让 Element Review canvas 描虚线贴合异形元素)。MVP 接受 bbox 描边在异形元素上不贴合——这是 review 阶段的视觉精修,不影响产出。

如果未来证明 review 体验差到影响判断,再加 polygon。当下不加

### 6. **Pass 2 用绿幕 `#00FF00` 背景做 chroma key 参考色,严禁 transparent prompt 也严禁白底 prompt**(2026-05-13 PoC v11 锁定)

**白底为什么不行**:虽然 v8 实测白底能让 gpt-image-2-official 高保真保留文字风格,但本地抠图时 white-threshold 会**抠穿元素内部任何纯白像素**——chip 白底、娃娃白发、奶盖、奶茶杯白色高光。任何 UI 元素内部存在白色就死。**结构性死路**,不是边界 case。

**transparent 为什么不行**:让 model 直接出 RGBA 时,gpt-image-2-official 退化成「regenerate」模式——漏画元素 / 元素挤一起 / 偶尔字形漂(v10-A 实证)。模型不知道怎么「画」alpha 通道,就开始重组画面。

**绿幕为什么行**:让 model 输出 `#00FF00` 饱和绿色背景,本地按「绿色饱和度」(`G - max(R, B)`)做 chroma key。原因:
1. 模型对「彩色饱和背景」跟「白底」一样**不漂移**(v8 + v11 双重验证)
2. UI 元素内部几乎不出现 `#00FF00`,key 出来不会抠穿元素内部任何颜色,白色 / 浅色 / 半透 / 玻璃质感**全部保留**
3. 0 API + ~1s 处理,比 koukoutu/rmbg/SAM 都快
4. v11 实测 76.7% 透明 + 23.2% 不透明 + 0.2% 半透,边缘极干净

**正确 pipeline**:
```
Pass 1 → 元素列表(static/code 二分类)
Pass 2 → image-edit + 绿幕 #00FF00 背景输出(高保真 + 文字保留)
本地 chroma green key(g_excess = G - max(R, B), 25/60 ramp + spill suppression)→ 透明 PNG
ref/split_elements.py(scipy binary_dilation + connected component, gap=15)→ 单元素 asset
```

**Pass 2 prompt 必须包含**:
- 「鲜亮的纯绿色 `#00FF00` 背景画布,作为后期抠像的绿幕。元素本身不要使用这个绿色」
- **数量明示的元素清单**:自然语言列出每个元素的数量(「奶茶 chip 共 3 个」/「粉色挂钩 2 个」),最后一句「共 N 个元素,记得每个都画到」防止模型漏画(v9-v10 反复出现的问题)
- 「保持原图的风格、颜色、文字内容,不要重新设计任何元素,每个都要跟原图里完全一致」
- 元素间距「至少一整个元素宽度的空隙,宁可画布留白多也不要挤在一起」
- **会话式自然语言**——不要 hard rules / TRUST SOURCE / pixel-faithfully(v2 失败教训) / 不要塞 entity_name / bbox / JSON 字段名(v1/v3 失败教训)

### 7. **抠图走本地 chroma green key,不要 koukoutu / rmbg / SAM 任何外部分割模型**(2026-05-13 PoC v11 锁定)

绿幕背景输入下,本地 chroma key 已经 0 噪点 + 0 抠穿:
- API 调用:0
- 时延:~1s(numpy)
- 边缘质量:跟 koukoutu 同级别(v11 对比实测)
- 内部白色保留:✅(white-threshold 死的 case 全过)

参数(初始默认):
```
g_excess = G - max(R, B)
g_excess > 60 → α = 0     (完全透明)
g_excess < 25 → α = 255   (完全不透明)
中间               → 线性插值

# Spill suppression: 不透明像素上把绿溢色压回去
# 防止元素边缘有「淡绿描边」
G_new = G - max(0, g_excess) for pixels with α > 0
```

UI 提供 slider 让用户调阈值,Asset Review 提供「edge clean」按钮做局部清理。

**SPEC 之前预留的 `kind: 'segmenter'` provider 已删除**,不再有任何 fallback。如果某页面元素恰好用了纯 #00FF00(罕见,UI 设计稿几乎不存在),处理方式:用户在 Asset Review 单元素重抠 + 手动覆盖,不引入新模型。

### 8. **Pass 1 走 5 路并行 only-X mllm,合并用 IoU > 0.5 + 优先级**(2026-05-14 Phase 8b 锁定)

Pass 1 不是 1-shot,是 5 路 `Promise.allSettled`(subject / button / container / background / decoration),每路独立 callMllm + 独立 sub-run(`pass: 'pass1_subject'` 等)。**`Phase 8b 之前的 1-shot 路径已删除`**,不要回退。

**关键约束**:

1. **每路 prompt 必须 over-include**——头部用「Be EXHAUSTIVE. **Better to over-include than to miss.**」措辞,**严禁** `EXCLUSIVE` 措辞如 `DO NOT return others` / `lean toward NOT returning` / `only return X, skip everything else`。PoC #2 v2 实测 EXCLUSIVE 会让模型在边界 case 普遍丢元素(decoration 路丢小贴纸徽章 / subject 路丢艺术字),over-include + IoU 合并去重才是正解
2. **路次合并阈值是 IoU > 0.5**(在 `lib/pass1-route-merger.ts`),冲突时按 `subject(1) < button(2) < container(3) < background(4) < decoration(5) < other(6)` 优先级取胜出 category,被丢弃的路把 category 加到 `pass1_routes_seen` 数组(debug 用)
3. **跨 state 合并改用 IoU,不再用 entity_name**(`mergeWithExisting` in pass1-runner)。理由:over-include 模式下同一物理元素在不同 state 的 entity_name 可能不一致(LLM 注意力分散),bbox 重叠才是更稳的对齐信号
4. **≥3/5 才算成功**——`MIN_SUCCESS_ROUTES = 3`,< 3 抛 `PASS1_ERROR`。理由:某一路偶发超时 / JSON 解析失败可容忍,但跑通 < 60% 就是质量信号,直接报错让用户重试
5. **想加新 category 维度?** 直接扩展 `VisualCategory` enum + `VISUAL_CATEGORIES` 数组 + `VISUAL_CATEGORY_PRIORITY`,5 处同步,**不要**新加正交分类维度(参考 §4 反对第三类的逻辑)

**OVER-INCLUDE 措辞反例(写 prompt 时绝对不要出现)**:
- ❌ `Return ONLY {category} elements, skip others`
- ❌ `Do NOT return decoration / subject / ...`
- ❌ `If you're not sure, lean toward NOT returning`
- ❌ `Be conservative, only return clear-cut cases`

**OVER-INCLUDE 措辞正例(see `lib/prompts/render-pass1-route.ts`)**:
- ✅ `Be EXHAUSTIVE. Better to over-include than to miss.`
- ✅ `If you see ANY visual element that COULD plausibly be {category}, return it.`
- ✅ `Cross-route overlaps are FINE — downstream IoU merge handles dedup.`
- ✅ `When in doubt, INCLUDE.`

## 注意事项(pinpoint)

### 与 LLM 交互

- **Pass 1 返回必须是严格 JSON**,不接受 markdown code fence 包裹的 JSON。Prompt 里写「output strict JSON, no prose」并设置 `response_format: { type: "json_object" }`(OpenAI)或 prefill `[` (Anthropic)
- **跨状态对齐靠 IoU > 0.5**(Phase 8b 后)。Phase 8b 之前是 entity_name 字符串匹配,现已改为 bbox IoU(over-include 模式下 entity_name 不稳)。LLM 仍被要求输出 entity_name 但只用于展示,不参与对齐
- **Pass 2 输出尺寸 = 原图尺寸**。如果模型支持指定输出尺寸,显式传入;不支持时在切片前 resize
- **API key 永远不出现在前端**:GET /api/config 返回 `sk-***xxxx`(`maskKey`),用户编辑时 mask 字符串视为「未改动」,PUT 时服务端 `unmaskApiKeys` 还原
- **endpoint_kind 字段**(在 ProviderConfig 中)区分 chat / image_generation / image_edit。`mllm` kind 必须 chat;`image_gen` kind 走 image_edit(GPT-image-2);加新 provider 时正确设置

### 与文件系统交互

- **所有 JSON 写都走 `writeAtomic`**(tmp + rename),不要直接 `fs.writeFileSync`
- **PNG 写**(原图 / 提取图 / 切片 asset)直接 `fs.promises.writeFile`,不需要原子写
- **`data/elements/{page-id}.json` 是整批替换**——用户在 Element Review 改完点保存,前端发整个 Element[],服务端整文件覆写。**不要做字段级 patch**,简化并发控制
- **同 state 的 Pass 1 / Pass 2 / re-extract 互斥**,用内存 Map 维护 lock,冲突返回 409

### 与 coding agent 交互(Export 之后)

- **`spec.md` 是 coding agent 的主入口**,所有 layout / asset 引用都从这里展开
- **manifest.json 必须读**,因为 cdn_url 可能 null(用户跳过了 CDN 上传),coding agent 要 fallback 用本地路径
- **`raw/original-*.png` 永远导出**,即使 coding agent 不直接使用,它在写代码时可以肉眼参考视觉风格

### 反向校验是「不阻断」的

Pass 2 后的反向校验产出 `alpha_quality / complete / contamination` 等指标,**只用于给用户提示**,不阻断 pipeline。即使所有元素校验失败,用户仍可继续上传 CDN(用户主权大于 LLM 判断)。**唯一阻断**是 `failed`(Pass 2 完全没产出该元素)

## 跟 evalyst 的关系

img2UI 在多个层面复用 evalyst 的代码与模式,但**不是 fork**:

- ✅ **直接抄**:`fs-utils.ts` / `middleware.ts` / `confirm-dialog.tsx` / `sticky-save-bar.tsx` / 文件系统持久化模式 / API key 双向 mask 模式 / Sidebar 布局
- ✅ **借鉴改造**:`llm-config.ts`(加 `kind` discriminator)/ `llm-client.ts`(加 image_gen / cdn 分发)/ `batch-runner.ts`(改成 pipeline-runner)
- ❌ **不抄**:Glass UI 7 档(img2UI 视觉更工具化,普通 Card 即可)/ Copilot 子系统(无内嵌 AI 助手)/ template-builder(用途不同)/ Datasets / Schemas / Rubrics(无相关概念)
- ❌ **不要**复用 evalyst 的 i18n 模式——evalyst 双语,img2UI MVP **只做中文**,不引入 i18n 框架。所有文案写死中文(英文术语保留如 `Pass 1`、`bbox`、`asset`)

## 当前阶段

项目处于 **PoC v11 完成 / 架构锁定 / Phase 1 项目骨架待启动** 阶段。

**详细历史**:`poc/EXPLORATION-HISTORY.md`(v1-v11 完整记录 + 教训)
**v11 终版决策摘要**:`poc/V10-PLAN.md`(已重写为 v10/v11 总结报告)

**MVP-α 锁定的架构**:
```
Pass 1 (gemini-3.1-pro-preview via sankuai gateway, temperature=1)
  → Pass 2 (apimart gpt-image-2-official, 绿幕 #00FF00 背景, quality=high, resolution=1k)
  → 本地 chroma green key (g_excess = G - max(R,B), 25/60 ramp + spill suppression)
  → ref/split_elements.py (scipy binary_dilation + connected component, gap=15, opaque% > 1% 二级过滤)
```

**v11 实测**:11/11 元素全命中,文字 100% 准,chip 白底 / 娃娃白发 / 奶盖白色全部保留,$0.17/页。

**全部被推翻的尝试**(可作反面教材,**不要重复**):
- ❌ ~~v2 的「TRUST SOURCE NOT DESCRIPTION」~~ → 触发 model 自由发挥
- ❌ ~~v3 的「含文字=type=code」反直觉规则~~ → 用官方通道后文字保留 OK
- ❌ ~~v4 的「黑底背景」~~ → 官方通道下白底也能保留文字(但白底也被 v11 否)
- ❌ ~~v6 的「PIL 矩形 crop + colour distance bbox」~~ → 元素白色被误判为背景
- ❌ ~~v7 的「让 model 直接出真 transparent」(backup 通道)~~ → 触发 regenerate 文字乱码
- ❌ ~~v9-A 的「per-crop koukoutu」~~ → chip 白底被误抠
- ❌ ~~v9-B 的「直接从原图 crop」~~ → 原图密集排布 bbox 精度不够
- ❌ ~~v10 的「白底 + 本地 white-threshold」~~ → **抠穿元素内部白色,结构性死路**
- ❌ ~~v10-A 的「显式要求 transparent alpha」~~ → 仍触发 regenerate,漏画 + 棋盘格 RGB
- ❌ ~~v10 的 koukoutu fallback 路径~~ → chroma key 后已不需要任何外部抠图模型

@AGENTS.md
