# img2UI PRD

> 把 AI 生图设计稿 → coding agent 可消费的素材包,本地 web app
>
> **配套文档**:技术契约见 [SPEC.md](./SPEC.md);Claude Code 工作约束见 [CLAUDE.md](./CLAUDE.md);开发流程见 [AGENTS.md](./AGENTS.md)

# 背景

## a）AI 生图模型能力跃升,「设计师画稿」范式正在松动

1. **GPT-image-2 等模型已能稳定产出高质量异形 C 端 UI 设计稿**:不规整的容器、毛玻璃质感、3D 角色、装饰性 chip、光影/材质——这些过去最难组件化、最依赖资深设计师的元素,现在可以通过 prompt + 参考图直接探索
2. **设计探索成本接近归零**:同一份设计意图可以让 AI 在几分钟内产出 4-8 个不同方向的设计稿(参见用户提供的 4 屏奶茶盲盒案例),设计师从「画稿」转向「打 prompt + 筛稿 + 微调」
3. **传统设计-到-代码的链路出现错位**:设计师手画稿子时,产出物是 Figma 设计文件,带图层、组件、绑定的语义;AI 生图产出物是一张栅格化 PNG,所有信息扁平、没有语义层级。这一步从「图层化」回退到了「像素」,是新范式的核心瓶颈

**<font style="color:#DF2A3F;">综上所述:AI 生图正在改变设计探索范式,但「图 → 可消费的工程产物」这一步还没有合适工具,这就是 img2UI 的机会窗口</font>**

## b）现有 image-to-code 工具的边界画错了

1. **「v0.dev / Anima / Builder.io」做的是「整图 → HTML/JSX」**:它们假设设计稿是规整的、可组件化的(本质是 Figma 风格的扁平 UI),对异形元素、3D 渲染、装饰素材几乎没有处理能力。生成出来的代码基本是空盒子 + 占位符
2. **它们生成「最终代码」,但用户真正需要的是「中间产物」**:设计师/工程师对最终代码细节(用什么组件库、什么状态管理、什么命名)有强 opinion。end-to-end 黑盒生成出来的代码几乎都要重写,让 image-to-code 工具直接产出代码是错误的边界
3. **它们没有给 coding agent 留接口**:Claude Code、Cursor 这类 coding agent 已经能按文档/spec 写出贴合项目风格的代码,真正缺的是「设计稿的结构化描述 + 静态资产」,不是「另一份生成的代码」

**<font style="color:#DF2A3F;">综上所述:已有工具的边界画错了。它们要替代 coding agent 直接产代码;我们要做的是给 coding agent 喂结构化输入</font>**

## c）coding agent 已经成熟,可以承接代码生产

「Claude Code」「Cursor」「Codex」这些 coding agent 在 2025 年下半年已经能稳定按 spec.md / docs/*.md / 现有代码风格生产高质量代码。它们的瓶颈不在「写代码」,而在「拿到结构化、可执行的输入」。img2UI 的产出物——透明 PNG 资产 + bbox + 元素描述 + spec.md——正好是 coding agent 最舒适的输入形态

## d）综合判断 → 项目方向

**做一个本地 web app,把「AI 生图设计稿」转成「coding agent 可消费的素材包」。具体形态:**

- 用户在本地配置:多模态 LLM 接口 / 图像生成接口 / 可选分割接口 / CDN
- 在「项目-页面-状态」三层结构下上传设计稿
- 系统通过两条独立 pass(布局分析 + 资产提取)产出:透明 PNG 资产 + layout.json + spec.md
- 全程用户可在每个步骤介入 review、修正、重跑
- 最终把项目文件夹扔给 Claude Code / Cursor 由 coding agent 完成代码生产

**<font style="color:#DF2A3F;">不替代设计师,不替代 coding agent,只填补两者中间的缝隙</font>**

# 调研

**<font style="color:#DF2A3F;">三条核心洞察:</font>**

1. **<font style="color:#DF2A3F;">不要试图自己实现端到端「图 → 代码」,只做「图 → 结构化素材包」,把代码生产留给 coding agent</font>**
2. **<font style="color:#DF2A3F;">不要重新生成单个素材(风格漂移),要在原图基础上做「语义图层分离」</font>**
3. **<font style="color:#DF2A3F;">每一步必须可 review、可中断、可重跑——AI 输出永远不能假设一次正确</font>**

| 调研对象 | 启发 |
|---|---|
| **「v0.dev / Anima / Builder.io」**<br/>image-to-code 工具,直接产 React 代码 | 1. 边界错了——它们想替代 coding agent,但用户需要的是结构化输入<br/>2. 异形元素处理能力极差,基本只能处理规整 UI<br/>3. 黑盒不可介入,产出代码几乎都要重写 |
| **「SAM 2 / Grounded-SAM / rmbg」**<br/>分割与抠图模型 | 1. SAM 范式下 bbox 是 prompt 不是物理裁切,异形元素抠得干净<br/>2. 但需要单独搭建调用链路,且对 GPT 生图的「干净绿幕背景」是大材小用<br/>3. **PoC v11 验证后已不需要**——本地 chroma green key 已能 0 API 处理所有 case |
| **「GPT-image-2 image-edit 能力」**<br/>OpenAI 的 image edit + transparent canvas | 1. 接受图像输入做 style preservation,语义图层分离不漂移<br/>2. 透明背景输出原生支持,跳过抠图链路<br/>3. 一次批量生成 N 个元素比 N 次单元素生成省 N 倍成本 |
| **「evalyst」仓库**<br/>嘉锟之前做的 LLM 评测工具,Next.js + 文件系统 JSON | 1. Next.js + 文件系统 JSON + 无前端状态库的「本地 web app」骨架,零部署成本<br/>2. provider 配置 + API key 双向 mask 模式可直接照搬(`maskKey` / `unmaskApiKeys`)<br/>3. shadcn v4 + base-ui + sonner + Tailwind v4 是稳定栈 |
| **「Claude Code / Cursor / Codex」**<br/>coding agent | 1. 能按 spec.md + 资产文件夹生产贴合项目风格的代码<br/>2. 真正瓶颈是「拿到结构化输入」,不是「写代码」<br/>3. 输出格式应该贴合它们最舒适的消费形态:文件夹 + markdown + 引用资产 |

# 产品方案

## 1）产品思考

#### Q1：img2UI 究竟是给谁用的?设计师还是工程师?

**A1:主要给「同时在做设计探索 + 代码落地」的全栈型从业者用,以及「拿到 AI 生图设计稿后要落地代码」的前端工程师用**

不打算分割「设计师专用」/「工程师专用」两个产品。AI 生图本身就在模糊设计师和工程师的边界——一个会打 prompt 的工程师能直接产设计稿,一个能读 spec.md 的设计师能调用 coding agent 写代码。img2UI 的目标用户就是这群在新范式下两边都干一点的人。具体场景:

1. 工程师收到设计师/产品丢过来的 4 张 AI 生图设计稿,要落地代码——用 img2UI 把它们转成结构化素材包,丢给 Claude Code
2. 设计师自己探索完几版设计稿,想看看落地后的真实效果——用 img2UI + coding agent 跑通一遍,拿真实代码给团队 review
3. 团队批量做活动页/营销页——固定流程,从生图到上线一条流水线

#### Q2：为什么是「项目-页面-状态」三层结构,不是更扁平或更深?

**A2:三层是「实际工作单元」与「资产复用边界」的最小公倍数**

- 「项目」对应一次「业务交付」(一个活动、一个 feature),共享 CDN 配置、命名空间、coding agent 提示语
- 「页面」对应一个「路由」或「独立 UI 单元」,各自有独立的资产库
- 「状态」对应同一个页面的「多种 UI 状态」(canonical / loading / empty / error / hover),共享同一份资产库,只是 layout 不同

如果只有「项目-页面」两层,多状态的资产去重、跨状态对齐没法表达;如果加到四层(项目-模块-页面-状态),又过度工程,大部分用户用不到。**<font style="color:#DF2A3F;">三层是验证过的最小可用结构</font>**

#### Q3：为什么是「两条独立 pass」而不是端到端一次调用?

**A3:布局分析和资产提取要解决的问题完全不同,耦合在一起会牺牲两边的质量和可控性**

- **布局分析**(Pass 1):需要 vision-language 模型理解设计稿语义、判断元素分类、输出 bbox + 描述。这是个「理解 + 生成结构化数据」任务
- **资产提取**(Pass 2):需要 image-edit 模型保留风格、做语义图层分离、输出透明 PNG。这是个「图像生成」任务

两件事天然分属不同模型(多模态 LLM vs image-edit 模型),硬塞到一次调用里要么模型能力不够、要么丢失中间结果让用户没法 review。**<font style="color:#DF2A3F;">解耦后,Pass 1 错了不影响 Pass 2 的素材;某个素材抠糊了不动 Pass 1 的布局</font>**

#### Q4：为什么不要 polygon outline,只要 bbox?

**A4:polygon 对 Pass 2 提取质量没有功能贡献,纯 UX 辅助。MVP 不做**

GPT-image-2 不接受 polygon-aware 条件输入。文本 prompt 里写顶点坐标对生成精度帮助有限。Pass 2 真正需要的是:原图作为风格参考 + 元素描述 + bbox 大致定位——三件套足够。Polygon 唯一作用是 Element Review canvas 里描虚线贴合异形元素,这是视觉精修不影响产出。**<font style="color:#DF2A3F;">等真用起来发现 review 体验差到影响判断再加,MVP 接受 bbox 描边在异形元素上不贴合</font>**

#### Q5：异形容器(承载内容的盒子,比如那个粉色卡片框)怎么处理?

**A5:不抠图,只描述。多模态 LLM 在 Pass 1 阶段把它判定为 code 类元素,出形状描述 + 材质描述 + 子元素列表给 coding agent 自行实现**

异形容器有三个特征:(1) 异形(notch / 圆孔 / 圆角); (2) 承载内容; (3) 内容长度变化时尺寸要响应式。把它抠成 PNG 会:撑不开内容、丢失结构、丢失上下关联(挂钩 / 引线)。多模态 LLM 输出的描述应该具体到「SVG path 或 CSS clip-path 路径点 + 渐变色值 + 内阴影参数」,coding agent 能直接转代码

#### Q6：单元素重抠的粒度是什么?

**A6:用户在 Asset Review 屏针对单个 asset 触发,系统重发一次 Pass 2 但只针对该元素,产出 PNG 合并回 Batch PNG**

不允许「整体重跑 Pass 2」作为重抠路径——成本太高。失败/不满意的情况几乎都是单元素问题(某个元素提取糊了),针对单元素重发 LLM 即可。重抠时:(1) 用户在 Element Review 改该元素的 `description`(它是 Pass 2 prompt 的渲染源); (2) 服务端只对这一个元素调一次 image-edit(element_summary 渲染只含该元素); (3) chroma key + 切片后替换该 asset

## 2）产品定义

### 形态

**本地 web app**(非 SaaS、非桌面 native)。Next.js 构建,数据存在 `process.cwd()/data/` 下的 JSON 文件,无后端服务,不部署。用户 `npm run dev` 起服务,浏览器访问 `localhost:3000` 使用

理由:
- ✅ 上手成本极低(打开浏览器即可),不用装 Electron / 配 Docker
- ✅ API key、设计稿原图、CDN secrets 都在本地,无隐私风险
- ✅ 可被 Claude Code 直接读项目文件夹,跟 coding workflow 无缝衔接
- ❌ 不支持多人协作——但 MVP 阶段不是问题,后期可以加 git sync

### 核心流程

```
[配置模型/CDN] → [新建项目] → [新建页面] → [上传 N 张状态图]
  → [Pass 1: 布局分析] → [Element Review]
  → [Pass 2: 资产提取] → [Asset Review]
  → [上传 CDN] → [导出项目文件夹] → [coding agent 消费]
```

### 关键指标(MVP)

| 层级 | 类型 | 指标 |
|---|---|---|
| **结果指标** | 端到端可用性 | 一张 AI 生图设计稿 → 可消费的素材包,**完成率 ≥ 80%**(coding agent 能直接读懂并产出贴合的代码) |
| **结果指标** | 端到端时延 | 单页面 1 个状态、~10 个元素,**端到端 < 5 分钟**(含两次 LLM 调用 + 用户 review 时间) |
| **过程指标** | Pass 1 准确率 | bbox IoU > **0.7** / 分类准确率 > **90%** / 描述可读性人工评分 ≥ 4/5 |
| **过程指标** | Pass 2 提取干净度 | alpha 边缘伪影率 < **5%** / 元素完整度 > **95%**(多模态反向校验) |
| **过程指标** | 用户介入次数 | 平均每页 review 介入次数 < **3 次**(过多说明模型质量或 UX 出问题) |

## 3）技术路径

### 整体架构

单进程 Next.js 本地 web app:浏览器 ↔ Route Handlers ↔ 文件系统 + 外部 LLM/CDN API。无独立后端、无数据库、无认证(localhost-only + CSRF gate)。

完整架构图(含层级 / 依赖 / 数据流) → 见 [SPEC.md § 整体架构](./SPEC.md#整体架构)

### 数据模型(高阶)

四层实体:`Project → Page → State → Element/Asset`,加一组横向的 `ProviderConfig`(Models/CDN)和 `PipelineRun`(执行记录)。完整 TypeScript 类型定义见 [SPEC.md § 数据 schema](./SPEC.md#数据-schema)

**跨状态资产对齐**:Pass 1 输出的 element 列表里,**同一物理实体在多个 state 下共享 element.id**。多模态 LLM 在 Pass 1 时被要求做跨图对齐——同一物理实体在多个截图中出现时,使用同一个 `entity_name`(英文小写下划线)。前端拿到结果后做合并,Pass 2 阶段只对 canonical state 的 unique element 做提取(共享资产),state-specific element 在它出现的 state 里单独提取

### API 接口

完整 API 路由契约见 [SPEC.md § API 契约](./SPEC.md#api-契约)。覆盖范围:provider 配置 CRUD(含 test connection 与 API key 双向遮罩)/ 项目-页面-状态 CRUD / Pipeline 异步触发与轮询 / Element 批量更新 / Asset 重抠与上传 / Export 打包

### Pass 1 / Pass 2 prompt 模板(写入 Prompt 的硬规则)

#### Pass 1: 布局分析

**红线(写入 Prompt):**
- **输入**:1-N 张同页面不同状态的设计稿 + 用户填的页面描述 + 用户填的 tech_stack_hint
- **输出格式**:严格 JSON,字段固定 `[{ entity_name, type, bbox, z_index, description, shape_spec?, material_spec?, cross_state_notes? }]`
- **元素分类二选一**:
  - `static`:纯装饰、形状固定、不承载内容、不响应式变化的元素(角色、装饰 chip、印章、徽章)
  - `code`:能用代码实现的所有其他元素,包括:常规 UI(按钮、文字、状态栏)、引线/虚线/连接线、**异形容器(承载内容、需要响应式)**
- **跨状态对齐**:同一物理实体在多个截图中出现,必须使用同一个 `entity_name`(英文小写下划线,如 `cute_doll_main`)
- **bbox 坐标系**:相对 canonical 状态原图的归一化坐标 `[x, y, w, h]`,值域 0-1
- **description 受众**:写给 coding agent 的人话(也是 Pass 2 prompt 渲染源),具体到形状/材质/位置/语义,**不超过 80 字**
- **禁止行为**:不要补全被遮挡部分;不要试图描述每一个像素;不要给 `static` 元素写 `shape_spec`;不要写英文 `extraction_prompt` 或类似字段(已弃)

#### Pass 2: 资产提取

**红线(写入 Prompt):**
- **输入**:canonical 状态原图 + Pass 1 输出的 `type=static` 元素列表(每个含 name + description)
- **输出**:一张 `#00FF00` 绿幕背景的 PNG,所有列出的元素**互不重叠**地分布(网格或自然流式),保持各自的尺寸、视角、光影、风格不变。绿幕作为 chroma key 参考色,本地后处理抠出透明 PNG
- **数量明示**:prompt 末尾必有「共 N 个元素,记得每个都画到」+ 元素清单按 name 自动数量分组(防漏画 v9-v10 教训)
- **元素自带绿色禁忌**:prompt 显式说「元素本身不要使用这个绿色」(避免被本地 chroma key 误抠)
- **绝对禁止**:不要补全被遮挡部分(原图里有遮挡就保留);不要添加阴影;不要修改任何元素的形状、颜色、视角;非绿色像素只能属于列表中的元素
- **位置策略**:**不要求保持原坐标**——元素在原图中可能重叠,强行保位置会导致互相切片/渗色。元素在画布上互不重叠地分布即可,**间距至少一整个元素宽度**(防切片融合)
- **prompt 措辞硬约束**:会话式自然中文,**禁止** "TRUST SOURCE" / "MUST" / "pixel-faithfully" 等激进措辞(v2 失败教训触发模型 regenerate)

#### Pass 2 反向校验

**红线(写入 Prompt):**
- **输入**:Pass 2 输出的透明 PNG + Pass 1 元素列表
- **输出**:每个元素的 `{ asset_id, complete: bool, alpha_quality: 0-1, notes }`
- 校验维度:完整度(有没有缺角)、风格一致(跟原图比)、边缘干净度(alpha < 0.3 占比)、是否包含了不该有的内容(其他元素的碎片)

## 4）术语统一

| 术语 | 产品含义 | 技术/数据映射 |
|---|---|---|
| 「项目」 | 一次业务交付的容器,共享配置和命名空间 | `Project` 实体,`data/projects/{id}.json` |
| 「页面」 | 项目下的一个独立 UI 单元(对应路由) | `Page` 实体,`data/pages/{id}.json` |
| 「状态」 | 同一页面的不同 UI 状态(canonical/loading/empty…) | `State` 实体,关联一张原图 |
| 「canonical 状态」 | 页面的默认状态,跨状态共享资产以它为基准 | `page.canonical_state_id` |
| 「元素」 | 设计稿中被识别出的一个语义单元(角色、chip、按钮、容器…) | `Element` 实体,跨状态用同一 id |
| 「pure-static 元素」 | 必须以图片形式存在、无法用代码实现的元素 | `element.type === 'static'`,有对应 `Asset` |
| 「code 元素」 | 能用代码实现的元素(含异形容器) | `element.type === 'code'`,无 `Asset`,只有 description / shape_spec / material_spec |
| 「Pass 1 / 布局分析」 | 多模态 LLM 识别元素 + 输出 bbox + 分类 + 描述 | `POST /api/states/[id]/pass1` |
| 「Pass 2 / 资产提取」 | image-edit 模型批量产出透明 PNG + 切片 + 校验 | `POST /api/states/[id]/pass2` |
| 「资产 / Asset」 | type=static 元素对应的透明 PNG | `Asset` 实体,本地文件 + 可选 CDN URL |
| 「Element Review」 | Pass 1 后用户检查/修改元素列表的步骤 | 路由 `/projects/[pid]/pages/[id]/elements` |
| 「Asset Review」 | Pass 2 后用户检查/重抠资产的步骤 | 路由 `/projects/[pid]/pages/[id]/assets` |
| 「跨状态对齐」 | 同一物理元素在多状态下共享 element.id 与 asset 的机制 | Pass 1 prompt 强制 `entity_name` 同名 |
| 「provider」 | 用户配置的一个外部接口实例(MLLM、ImageGen、Segmenter、CDN) | `ProviderConfig`,按 `kind` 分组 |
| 「pipeline run」 | 一次 Pass 1 或 Pass 2 的执行记录(用于 debug / 重试) | `PipelineRun` 实体 |

## 5）具体方案 (Use Case 驱动)

### Use Case 1:配置 model 与 CDN

| 功能描述 | 原型说明 |
|---|---|
| **入口**: 顶部 Sidebar `Settings`<br/>**布局**: 一级 Tab(Models / CDN / Prompts),Models 下二级分组(Multimodal / ImageGen / Segmenter)<br/>**provider 卡片**:<br/>1. 每个 provider 一张卡,展示 `name` / `model` / 状态(Active / Idle / Error)<br/>2. 卡内字段(按 `kind` 显示不同字段):<br/>   - 通用:`name`、`api_format`(下拉)、`base_url`、`api_key`(password 输入框 + 显示/隐藏 button)、`model`(下拉,基于 api_format 联动)<br/>   - mllm/image_gen 额外:`default_temperature`(slider)、`default_max_tokens`(input)<br/>   - cdn 额外:`bucket`、`region`、`public_url_prefix`<br/>3. **Test Connection** button:发一次最小请求,Badge 渲染 ok/fail<br/>4. **Set Active** button(同一 kind 下唯一)<br/>5. **Delete** button(走 `useConfirm` Promise)<br/>6. 卡片底部 Add Provider button + 全局 StickySaveBar<br/>**API key 双向遮罩**(直接复用 evalyst 模式):<br/>- 服务端 GET 时调 `maskKey` 返回 `sk-***xxxx`<br/>- 用户编辑时若没改 API key,前端回传 mask 字符串<br/>- 服务端 PUT 时调 `unmaskApiKeys` 用磁盘原值还原 | 参见 ASCII 屏 `Settings — API 配置` |

### Use Case 2:新建项目 + 新建页面 + 上传状态图

| 功能描述 | 原型说明 |
|---|---|
| **入口**:Sidebar `Projects` → `+ New Project` Dialog(`name` / `description` / `tech_stack_hint` / `cdn_provider_id`)<br/>**项目列表**:每个 Project 卡片顶部 aspect-square 缩略图(项目下首张有缩略图的页面;没有则显 `<Folder>` icon),便于「靠肉眼瞄缩略图秒定位项目」<br/>**进入项目**:进入 Pages 列表,空态展示 `+ New Page` 大按钮<br/>**页面列表**:每个 Page 卡片顶部 aspect-square 缩略图(canonical state 256px 缩略图;没上传则显 `<FileText>` icon)<br/>**新建页面**:Dialog(`name` / `route_hint`),创建后跳转到 Page 详情页<br/>**Page 详情页 - States 区**:<br/>- 已有 state 卡片(显示缩略图 / state name / canonical 标记 / pipeline 状态 badge)<br/>- 最后一张是 `+ Upload States` 卡片,支持点击或拖拽<br/>- 上传 dialog:多文件选择,每张文件填 state name(默认 canonical / hover_1 / empty 等),指定哪张是 canonical<br/>- 上传完成后刷新 States 区,**首张 canonical state 上传时同步生成 256px 缩略图**(写到 `data/thumbs/{page-id}.png`,失败不阻断),自动触发 Pass 1(可在 settings 关掉自动触发)<br/>**Pipeline 进度区**:<br/>- 6 步 stepper:布局分析 / 元素 Review / 资产提取 / 资产 Review / CDN 上传 / Export<br/>- 每步状态 icon(✓ / ⏳ / ⚪ / ✗)+ 简短状态文本<br/>- 当前可操作步骤高亮,提供 `View / Run / Retry` button<br/>- 失败步骤展示错误摘要 + Retry button | 参见 ASCII 屏 `Page 详情` |

### Use Case 3:Element Review (Pass 1 完成后)

| 功能描述 | 原型说明 |
|---|---|
| **入口**:Page 详情页 `View Elements` button,或 Pipeline `布局分析 完成` 后自动跳转<br/>**布局**:左 Canvas + 右 Element 列表 + 底部选中元素详情 panel<br/>**Canvas (左)**:<br/>1. 默认显示 canonical 状态原图(下拉切换其他 state)<br/>2. 顶部 toolbar:`👁 Outlines toggle` / `🏷 Labels toggle` / `Filter ▾(all/static/code)` / `Opacity slider`<br/>3. **拖框语义提示横幅**(canvas 顶部):「拖动框 = 调整位置坐标(进 layout.json)且作为 Pass 2 参考图裁剪边界。改 description / 类别 / 拆合并需要重跑 Pass 2 才生效。」明示拖框只改 layout 不重跑 LLM<br/>4. Outlines 开启时,所有元素 bbox 圆角描边叠加(static 蓝色 / code 橙色)+ 角上漂浮元素 name chip<br/>5. **bbox 可拖拽**:8 个角点改大小 / 整体 hold 拖动改位置(modify mode)<br/>6. **空白区拖拽**:在没有任何元素的区域 mouse-down + drag 拉出新 bbox,松开后弹「新元素表单」<br/>7. 选中态:bbox 描边变粗 + 周围非元素区域 50% 暗化遮罩<br/>**Element 列表 (右)**:<br/>1. virtualized 列表,每条:check icon(已 review)/ name / type badge / **visual_category badge(subject/button/container/background/decoration/other 6 类彩色)** / cross-state badge<br/>2. 点击 row 选中,canvas 滚动到对应 bbox<br/>3. 顶部分组 tab(All / Static / Code / Unreviewed)<br/>4. **第二排筛选**:6 个 visual_category checkbox(默认全选),取消勾选即时隐藏对应类元素<br/>5. 列表底部 `+ Add element manually` button(等价于 canvas 拖出新 bbox)<br/>**选中元素详情 panel (底)**:<br/>- `name`(input)<br/>- `type`(radio: static / code,展示「why model chose ▾」可点开看模型理由)<br/>- **`visual_category`(select 6 选项,改后影响 Pass 2 调度组——同 visual_category 的元素并行进同一路 image_gen 调用)**<br/>- `description`(textarea,80 字限制 + 字数计数,**type=static 时此字段直接进 Pass 2 prompt 渲染,描述质量直接影响提取效果**)<br/>- type=code 时:`shape_spec`(textarea)+ `material_spec`(textarea)<br/>- `cross_state_notes`(textarea,可选)<br/>- 显示 `Cross-state: 出现在 [state-1, state-2]` 信息<br/>**Pipeline 进度(面包屑右侧)**:Pass 1 / Pass 2 触发后,实时显示多路进度 `Pass 1: 3/5 完成 ▮▮▮▯▯`,部分失败时附 `(2 failed)` 红色标签<br/>**底部 actions**:`Re-run Pass 1` / `Run Pass 2 →`(后者要求所有 Unreviewed 都被 check 过) | 参见 ASCII 屏 `Element Review` |

#### 空值兜底矩阵 - Element 字段

| 字段 | type=static | type=code | 用户未填 |
|---|---|---|---|
| `name` | 必填 | 必填 | 阻断保存,提示「请填写」 |
| `bbox` | Pass 1 输出,必有 | 同 | 异常,阻断 Pass 2 |
| `description` | 必填(直接进 Pass 2 prompt) | 必填 | 模型默认产出,用户可改;若清空,阻断 Pass 2 |
| `shape_spec` | **不展示** | 默认模型产出,可改 | 模型未产出时显示 placeholder「待补充」,**不阻断保存**(非阻断字段) |
| `material_spec` | **不展示** | 默认模型产出,可改 | 同上 |
| `cross_state_notes` | 可选 | 可选 | 留空即可 |

### Use Case 4:Asset Review (Pass 2 完成后)

| 功能描述 | 原型说明 |
|---|---|
| **入口**:Page 详情页 `View Assets` button,或 Pipeline `资产提取 完成` 后自动跳转<br/>**布局**:顶 Batch PNG 预览 + 中 Sliced assets grid + 底 选中资产详情<br/>**Batch PNG 预览 (顶)**:<br/>- 透明棋盘格背景显示 chroma key 后的 transparent PNG(可缩放;另有 toggle 切回看 Pass 2 原始绿幕版)<br/>- 鼠标 hover 任意元素时,所有非该元素区域 70% 暗化<br/>- 切片时使用的 connected component bbox 用虚线叠加<br/>**Sliced assets grid (中)**:<br/>- 每个 asset 一格:缩略图 + name + 尺寸 + 状态 icon(✓ ok / ⚠ warn / ✗ failed)<br/>- 状态 icon 来自反向校验结果 + alpha 边缘检测<br/>- 顶部 actions:`Upload all to CDN`(全量上传,串行进度条)<br/>**选中资产详情 panel (底)**:<br/>- 大图预览(透明背景棋盘格)<br/>- 校验结果展示:`alpha_quality: 0.92` / `notes: "右侧边缘有半透明残留"` / `validation_notes`<br/>- Actions:<br/>  - `Edge clean`(本地 spill suppression + alpha 微调,免调 LLM)<br/>  - `Adjust chroma threshold`(slider 调 chroma key 的 25/60 阈值,本地实时预览)<br/>  - `Re-extract this only`(回到 Element Review 改 description,然后单元素重发 Pass 2)<br/>  - `Manual upload override`(用户手动选择本地 PNG 替换,跳过 LLM)<br/>  - `Upload to CDN`(单个上传)<br/>**底部 actions**:`← Back to Elements` / `Continue → CDN Upload` | 参见 ASCII 屏 `Asset Review` |

#### 空值兜底矩阵 - Asset 状态

| 状态 | UI 展示 | 是否阻断后续步骤 |
|---|---|---|
| `extracted` 但未校验 | 黄色 ⏳ icon | 不阻断,但 Continue 时会触发自动校验 |
| `extracted` + 校验通过 | 绿色 ✓ icon | 不阻断 |
| `extracted` + 校验警告(alpha_quality 0.5-0.8) | 黄色 ⚠ icon | 不阻断,但提示「建议处理」 |
| `extracted` + 校验失败(alpha_quality < 0.5) | 红色 ✗ icon | **阻断 CDN 上传**,要求用户处理 |
| `failed`(Pass 2 没产出该元素) | 红色 ✗ icon + 「重抠」 | **阻断 CDN 上传** |
| `uploaded` | 蓝色 ☁ icon + CDN URL | 完成态 |

### Use Case 5:CDN 上传 + Export

| 功能描述 | 原型说明 |
|---|---|
| **CDN 上传**:Pipeline `CDN 上传` 步骤,展示进度条 + 单文件状态。失败重试单个。完成后所有 asset 都有 `cdn_url`<br/>**Export**:Pipeline 最后一步 → Export 屏<br/>**Export 屏内容**:<br/>- 显示输出文件夹路径(默认 `~/img2ui-out/{project-name}/`,可改)<br/>- 文件夹结构 tree 预览(只读)<br/>- 4 个 actions:`Open folder` / `Copy path` / `Download zip` / `Push to git`(可选,要求项目级配置 git remote)<br/>- Quick start 引导块:展示让 coding agent 开始的命令模板<br/>**生成的文件结构**:<br/>```<br/>{project-name}/<br/>├── config.json (project meta)<br/>├── pages/<br/>│   └── {page-name}/<br/>│       ├── meta.json (states, canonical, route_hint)<br/>│       ├── states/<br/>│       │   ├── canonical.json (layout: 元素 + 引用 asset_id)<br/>│       │   ├── hover.json<br/>│       │   └── empty.json<br/>│       ├── assets/<br/>│       │   ├── {asset-id}.png (本地副本)<br/>│       │   └── manifest.json (asset_id → cdn_url 映射)<br/>│       ├── spec.md (for coding agent,主入口文档)<br/>│       └── raw/<br/>│           ├── original-canonical.png<br/>│           └── extracted.png (Pass 2 留底)<br/>``` | 参见 ASCII 屏 `Export` |

#### spec.md 内容结构(写给 coding agent 的主文档)

```markdown
# {Page Name}

## 项目信息
- 项目: {project name}
- 路由: {route_hint}
- 技术栈: {tech_stack_hint}
- 状态: canonical / hover / empty

## 整体描述
{Pass 1 时让多模态 LLM 写的页面整体语义描述}

## 状态: canonical
### 元素列表
| id | type | name | description | asset / spec |
|---|---|---|---|---|
| ... | static | 卡通娃娃 | 蓬松云朵头发的小娃娃,蓝色羽绒服,Q弹奶油气质 | ↗ assets/cute_doll.png |
| ... | code | 粉色异形容器 | 圆角矩形,顶部有 notch,渐变粉色,内有微光 | shape: M0,40 ... fill: linear-gradient(...) |

### 布局描述
{由元素 bbox + z_index + 描述合成的人话布局}

## 状态: hover
{相对 canonical 的 diff,只列出变化的元素}

## 状态: empty
{同上}

## Coding agent 指令
- 优先使用项目现有组件库({tech_stack_hint 提取出来的})
- 异形容器请用 SVG path 或 CSS clip-path 实现,具体参数见上方 spec
- 静态资产引用 CDN URL(见 manifest.json),不要本地化
- 多状态用 React state 切换,共享同一组件
```

# 数据依赖总表

### 离线生产(用户上传 / 系统生成,持久化在 `data/`)

完整数据流(每条数据的来源 / 触发 / 用途) → 见 [SPEC.md § 数据依赖总表 § 离线生产](./SPEC.md#数据依赖总表)

### 在线消费(coding agent 读 Export 文件夹时)

| 文件 | 内容 | 空值语义 |
|---|---|---|
| `spec.md` | 整体描述 + 元素表 + 布局 + agent 指令 | 永远存在;无元素时显示「(待识别)」 |
| `states/{state}.json` | 该状态的 layout 数据(元素 + asset 引用) | 同 |
| `assets/{id}.png` | 本地素材副本 | type=static 才有,type=code 不存在 |
| `assets/manifest.json` | `asset_id` → `cdn_url` 映射 | 未上传 CDN 时该字段为 null,coding agent 应 fallback 用本地路径 |
| `raw/original-{state}.png` | 原始设计稿 | 永远存在,coding agent 可参考视觉风格 |
| `raw/extracted.png` | chroma key 后透明 PNG(Pass 2 留底) | 永远存在,debug 用 |

# 预期目标 + 上线/灰度策略

由于 img2UI 是本地工具,「上线灰度」简化为「分阶段交付」:

| 阶段 | 范围 | 用户群 | 退出准则 |
|---|---|---|---|
| **MVP-α** | **Pass 1**:sankuai gateway gemini-3.1-pro-preview / **Pass 2**:apimart gpt-image-2-official(绿幕 #00FF00 + quality=high + 数量明示 prompt)/ **抠图**:本地 chroma green key(0 API)/ **切片**:scipy binary_dilation + connected component / **CDN**:AWS S3。无 segmenter,无 git push | 内部 dogfood(嘉锟自己 + 直接同事 < 5 人) | 端到端跑通 1 个真实活动页(3 状态、~30 元素),coding agent 产出代码可直接用 |
| **MVP-β** | 多 provider 选项(Anthropic / Replicate / 其他 S3 兼容),加分割 fallback | 公开 GitHub 仓库,有兴趣的工程师自取自部署 | GitHub 100 星,issue 反馈集中在产品打磨而非根本性架构问题 |
| **v1** | 加 git push、加 multi-page batch、加 spec.md 自定义模板、加历史版本对比 | 同 β | 至少 3 个真实团队在用 |

**待评估事项:**

- <font style="color:#DF2A3F;">异形容器的 `shape_spec` / `material_spec` 输出格式需要先做 PoC 验证多模态 LLM 能否稳定产出 coding agent 直接可用的描述(可能需要约束输出为 JSON 而非自由文本)</font>
- ~~Pass 2 在元素数量 > 15 时是否一次能干净分离待验证~~ → **PoC v11 已验证**:gemini Pass 1 出 11+ static,apimart gpt-image-2-official 一次出齐,绿幕 chroma key 11/11 元素切片成功
- <font style="color:#DF2A3F;">连通区域切片在元素物理上靠近时(比如两个 chip 紧贴)可能误并;v11 测试中无此 case,但 prompt 里的「至少一整个元素宽度的空隙」要求是软约束,模型偶尔不遵守。Asset Review 提供「拆分」工具兜底</font>
- <font style="color:#DF2A3F;">CDN 是否需要支持非 S3 兼容的存储(七牛、阿里 OSS、腾讯 COS),MVP-α 暂不支持</font>
- <font style="color:#DF2A3F;">反馈闭环(coding agent 产出 → 视觉 diff)v1 之后再做,MVP 不含</font>
- <font style="color:#DF2A3F;">**PoC v11 关键发现**:Pass 2 用绿幕 #00FF00 背景 + 本地 chroma key 是 MVP-α 终版。白底被否(本地抠图穿元素内部白色)、transparent prompt 被否(触发模型 regenerate 漏画)、koukoutu/SAM 都不需要(本地 chroma key 0 API + 0 抠穿)</font>

---

**PRD 版本**: v0.2 (2026-05-13, 嘉锟 + Claude 共同设计;PoC v11 后架构锁定)
**参考代码**: https://github.com/kuen54/evalyst
