# PoC 探索历史(v1 ~ v11)

> 2026-05-12 至 2026-05-13,11 轮迭代,~40+ API 调用,$ ~1.0 总成本
>
> 测试用例:`inputs/canonical-512.png`(奶茶盲盒抽中页,472×1024,12-14 个 static 元素 + 容器/文字)
>
> **架构在 v11 锁定**:Pass 2 用 `#00FF00` 绿幕 + 本地 chroma green key + scipy `binary_dilation` 切片

## 一句话总结

v1-v8 都基于「**Pass 2 让 model 重画 layout 图,然后从 layout 图 crop**」的路径 A 思路;v9-B 试了「**直接从原图 crop**」的路径 B;v10 用 scipy split_elements 替代 PIL crop;**v11 把 Pass 2 背景从白色改成 `#00FF00` 绿幕,本地 chroma key 一锤定音**。

每一轮的主要瓶颈:
- **v1-v3 prompt 工程**:激进措辞触发 model 自由发挥
- **v4 背景颜色**:backup 通道下白底/黑底/棋盘 vs 透明,前者文字保真好(v8 推翻)
- **v5 prompt 上下文**:Pass 2 prompt 必须有页面上下文
- **v6-v7 抠图穿洞**:white-threshold 抠穿元素内部白色;transparent prompt 触发 regenerate
- **v8 通道选择**:必须用 `gpt-image-2-official` + `quality:high`,不是 backup
- **v9 切片粒度**:PIL 矩形 crop 太朴素(异形元素留空隙、密集排布带邻居)
- **v10 抠图判别色**:白底 + threshold 仍抠穿元素白色(结构性死路);transparent prompt 仍触发漏画;koukoutu 救得了棋盘格但单价高、还是要绕过 prompt 失败
- **v11 chroma key 解决一切**:绿幕作为判别色,UI 元素内部不出现 `#00FF00` → key 不抠穿任何东西

## 关键发现(按时间顺序)

### v1-v3:Prompt 工程纠结
- v1 (`pass2-real.txt`):描述驱动 prompt,带 hard rules → chip 风格忠实但缺商品图
- v2 (`pass2-real-v2.txt`):激进改成「TRUST SOURCE NOT DESCRIPTION」→ chip 风格漂移成实心粉
- v3 (`pass2-v3.txt`):纯自然语言长描述 → 介于 v1/v2 中间,chip 描边对但有切碎

**教训**:Pass 2 prompt 写「hard rules」「pixel-faithfully」让 model 反而**自由发挥**。简洁 prompt 反而稳定。

### v4:背景颜色实验
- v4-A 透明背景:文字乱码(SUPER → Sypze9)
- v4-B 黑色背景:文字保留好
- v4-C 棋盘格:文字变韩文乱码

**教训**:**(用 backup 通道时)**白底 / 黑底 / 棋盘 vs 透明,前者文字保真好。**但 v8 推翻了这个结论**——用官方通道时,这个差异可能不存在。

### v5:Verbatim user prompt
- 严格用 user 给的成功示例 prompt(120 字纯口语)
- 三次跑结果差异巨大,文字全乱(漏掉「这张图是奶茶盲盒页面」上下文)
- 加 1 句上下文后(v5-C)显著改善 → **Pass 2 prompt 必须有页面上下文**

### v6:Crop-first-then-koukoutu pipeline
- 白底 layout → 距离阈值 connected component → bbox → crop → 每元素单独 koukoutu
- 12 元素干净分离 ✓
- 但**娃娃白发被白底吞**(白发跟白底同色,colour distance 误判)
- 「完单可领超潮玩」原是「完单可收藏潮玩」(差 2 字)

### v7:Transparent + alpha-bbox 修白发
- 让 model 直接出透明背景,alpha-based bbox
- alpha-bbox 精度极佳 ✓
- 但**文字全乱码**(SUDERS / TPGS / GINATII)
- 解签印章丢失,2 杯变 1 杯

**教训**:transparent prompt 在 backup 通道触发 model「regenerate 而非 extract」。

### v8:发现官方通道
- **重大转折**:之前用 `model: "gpt-image-2"`(URL 含 `gpt_image_2_backup_*`,backup 通道),应改为 `"gpt-image-2-official"`
- 加 `quality: "high"` 参数
- v8-B(官方+白底):文字 100% 准,9 元素全在,质量碾压 v3-v7
- v8-A(官方+透明):返回**假棋盘 RGB**,不是真 RGBA(单次实验,可能 prompt 措辞改改还有戏)

**教训**:**Pass 2 必须用官方通道 + quality:high**。所有 v3-v7 的「字形漂移」都是 backup 通道质量低。

### v9-A:Path A 优化(分批生图 + Gemini 二次 bbox)
- 按元素类型 3 批 Pass 2,每批 3-5 元素 50+ 像素间距
- 每批 layout 图喂回 Gemini 检 bbox(不是 connected component)
- Crop layout + 单 crop koukoutu
- 11/11 独立 ✓,文字 100% ✓,bbox 完美无合并 ✓
- 但 **chip 白底被 koukoutu 抠掉**(chip 在 layout 上是「白 pill 浮在白底上」,koukoutu 把白当背景)
- 成本 $0.15/页

### v9-B:Path B 直接原图 crop
- Pass 1 出归一化 bbox,直接从原图按 bbox crop + 8% padding,koukoutu
- 13 元素分离 ✓,文字 100% ✓(原图直接 crop 当然准)
- 成本 $0.032/页(便宜 5x)
- 但**多个 crop 切错了**:SUPER 缺右半 / hanging_rings 把粉色容器边缘也圈进来 / auto_claim_badge 缺左缘 / 娃娃右上角带「G」字残留

**教训**:原图密集排布下,Gemini 给的归一化 bbox 精度不够支持矩形 crop。padding 大了带邻居,小了切到内容。

### v10:scipy split_elements + 验证 transparent / 白底两条 transparent 来源
- 分支 A(让 model 直接出真 RGBA + 显式 alpha 通道描述):返回 RGB 棋盘格(假透明),76% 是绿白棋盘交替写进 RGB 像素;chip 白底 = 棋盘格白格,无法 threshold 区分;Pass 2 漏画 chip 和印章
- 分支 B(白底 + koukoutu 整图抠):koukoutu 账户余额耗尽,降级走本地 white-threshold;切片 9 块完美;但 **chroma key 本质是 white-threshold,会抠穿元素内部白色**——v11 揭示这是结构性死路
- 分支 B 同时也跑了 koukoutu(余额恢复后):9 块 + 1 噪点,质量近似 local-threshold,API 多花钱

**教训**:
- 真 RGBA 通过 prompt 拿不到(模型不输出 alpha 通道)
- 白底任何抠图(threshold / koukoutu / SAM)都会抠穿元素内部白色
- scipy `binary_dilation` + connected component 替代 PIL crop 这一步 work,gap=15 切 9 块完美
- **下一步**:换 chroma key 判别色(从「白色」换到「不太可能在 UI 元素内出现的色」)

### v11:绿幕 chroma key + 数量明示 prompt(**架构锁定**)
- Pass 2 prompt 把背景改成 `#00FF00` 鲜亮绿色,显式说「绿幕作为后期抠像参考色,元素本身不要用绿色」
- prompt 末尾加自然语言数量清单:「奶茶 chip 共 3 个,文字分别是...」+ 「共 11 个元素,记得每个都画到」
- 本地 chroma key:`g_excess = G - max(R, B)`,> 60 全透明,< 25 全不透明,中间 ramp + spill suppression
- ref/split_elements.py(gap=15)切片
- **结果**:11/11 元素全画(数量明示治好了 v9-v10 反复出现的漏画问题),文字 100% 准,chip 白底 / 娃娃白发 / 奶盖白色全部保留,9 个 chip 不切碎(gap=15 桥接内部断裂),无邻居融合
- 单价 $0.17/页(quality=high 1024×1024 实际偏差,SPEC 之前估算的 $0.04 是错的)
- 12 块切片中 11 个完美,1 块横向挂钩朝向跟原图垂直挂钩不一致(模型自由发挥,prompt 不防御)

**教训**:
- 数量明示(自然语言清单)是 prompt 工程的杀手锏,治得了模型漏画
- 把 chroma 判别色换成「UI 内部几乎不存在的色」,所有 threshold 抠穿问题一次性解决
- spill suppression 用 numpy 一行实现:`G_new = G - max(0, g_excess)`,边缘干净

## 整体根因诊断(v1-v10 反复踩的两条主线)

**1. Crop 这一步用 PIL 矩形 crop 太朴素**(v3-v9 共有问题)。

PIL `image.crop((x0, y0, x1, y1))` 是矩形切割:
- 异形元素(chip 是 pill / SUPER 是倾斜椭圆)矩形包必带空隙
- 密集排布时矩形 padding 必带邻居
- chip 内部白色 vs 元素之间白色,矩形分不清

**ref/split_elements.py 给的关键启发**(v10 解决 crop 问题):
```python
mask = (alpha > 10)
dilated = ndimage.binary_dilation(mask, iter=15)   # 桥接同元素内部小断裂(gap=15 实测最佳)
labeled, num = ndimage.label(dilated)
# 每个 component 的 bbox 取 min/max → crop
```

`binary_dilation` 把所有 alpha>0 像素**膨胀 N 像素**,同元素内部的小断裂(chip 描边/文字之间几 px 白底)就被桥接成连通块。然后 connected component 切的就是「完整元素」而非「碎片」。

**2. 抠图判别色选错了**(v10 揭示的根本问题)。

任何「以白色为判别色」的抠图(white-threshold / koukoutu / SAM 默认)都会抠穿 chip 白底、娃娃白发、奶盖白色。这不是边界 case 而是**结构性问题**——只要 UI 元素内部存在判别色,就死。

**v11 解决**:把判别色从「白色」换成「`#00FF00` 鲜绿」——UI 设计稿里几乎不存在这个色,key 出来不抠穿任何元素内部颜色。本地 numpy 一行实现 chroma key,0 API + 0 抠穿。

## 已锁定的架构(MVP-α 终版)

```
原图(用户上传)
  ↓ Pass 1: gemini-3.1-pro-preview via sankuai gateway, temperature=1
[元素 JSON,二分类 static/code,bbox 归一化,description 中文]
  ↓ 提取 type=static 元素 → 按 name 分组 → 渲染数量明示自然语言清单
  ↓
Pass 2: gpt-image-2-official via apimart, quality=high, resolution=1k
  Prompt: 会话式 + 绿幕 #00FF00 + 数量清单 + 元素间距要求 + 「不要重新设计」
  ↓ 输出绿幕背景 PNG(高保真,文字 100% 保留)
  ↓
本地 chroma green key (lib/alpha-key.ts)
  g_excess = G - max(R, B)
  α=0 if g_excess > 60 / α=255 if g_excess < 25 / ramp / spill suppression
  ↓ 透明 PNG
  ↓
ref/split_elements.py 切片 (lib/slicer.ts)
  scipy binary_dilation gap=15 + connected component + min_size 30 + opaque% > 1% 二级过滤
  ↓
单元素 RGBA PNG → Asset
```

**v11 实测**:11/11 元素全命中,文字 100% 准确,chip 白底保留,$0.17/页,~3min 端到端

## 文件清单

```
poc/
├── inputs/canonical-512.png          # 测试图
├── prompts/
│   ├── pass1-system-v3.txt           # Pass 1 baseline
│   ├── pass1-system-v4.txt           # Pass 1 + RULE 1 容器=code
│   ├── pass1-system-v9b.txt          # Pass 1 + 强化 normalized bbox
│   ├── pass2-real.txt                # v1 描述驱动
│   ├── pass2-real-v2.txt             # v2 TRUST SOURCE(失败案例)
│   ├── pass2-v3.txt                  # v3 长 description
│   └── multi-elements*.txt           # v4 各种背景实验
├── scripts/
│   ├── probe-apimart.sh              # 通用 apimart 调用脚本
│   ├── slice.py                      # v3-v8 用的 BFS connected component
│   ├── run-v6/v7/v8/v9a/v9b-*.py     # 各阶段 pipeline 脚本
│   └── ...
├── outputs/
│   ├── v3-v9 各阶段产物
│   └── ...
├── REPORT.md                         # PoC v2 报告(已陈旧,v9 后变更多)
└── EXPLORATION-HISTORY.md            # 本文件
```

## 重要参考

- `ref/split_elements.py`:scipy binary_dilation + connected component 切片(user 提供的参考实现)
- `ref/generate_images_apimart.py`:工程级 apimart 调用模板(注意它默认 model 是 `gpt-image-2`,需切到 `gpt-image-2-official`)
