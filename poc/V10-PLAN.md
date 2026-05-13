# PoC v10 / v11 任务计划与结果

> **状态**:✅ **完成,架构在 v11 锁定**(2026-05-13)
>
> v10 验证了 scipy split_elements 切片可行,但发现「白底 + 任何抠图」都会抠穿元素内部白色;v11 把背景改成 `#00FF00` 绿幕 + 数量明示 prompt,11/11 元素全命中,锁定为 MVP-α 终版架构

## v11 锁定结论(短摘要)

**MVP-α 架构**:
```
Pass 1 (gemini-3.1-pro-preview)
  → Pass 2 (gpt-image-2-official, 绿幕 #00FF00 背景, quality=high, resolution=1k, 自然语言数量清单)
  → 本地 chroma green key (g_excess = G - max(R,B), 25/60 ramp + spill suppression)
  → ref/split_elements.py (gap=15, opaque% > 1% 二级过滤)
```

**实测**(`canonical-512.png`):
- 11/11 元素全画到(数量明示治好了 v9-v10 反复漏画)
- 文字 100% 准确(没有 v2/v7 那种「Sypze9」「瓦图茬丬」乱码)
- chip 白底 / 娃娃白发 / 奶盖白色全部保留(chroma key 判别色是绿色,不抠穿元素内部)
- $0.17/页(quality=high 1024×1024 实际单价)
- 端到端 ~3min

**为什么 v10 失败 v11 成功**:
- v10 分支 A(transparent prompt):仍触发 model regenerate,漏画 + 棋盘格 RGB
- v10 分支 B(白底 + 任何抠图):本地 threshold 抠穿元素白色,koukoutu 也抠穿,**结构性死路**
- v11:把 chroma 判别色从「白色」换成「`#00FF00`」——UI 元素内几乎不出现这个色,抠不穿任何元素

**详细 v10/v11 历史**:见 [`EXPLORATION-HISTORY.md`](./EXPLORATION-HISTORY.md) v10/v11 章节

---

## v10 原始 hypothesis(已验证 + 部分被推翻)

之前所有方案的瓶颈是 **PIL 矩形 crop**(切到内容 / 带邻居 / 异形元素留空隙)。

**v10 用 ref/split_elements.py 的 `scipy binary_dilation + connected component` 替代矩形 crop**,前提是输入是 transparent PNG。

获得 transparent PNG 的 2 种路径:
- ~~路径 ① 直接出~~:gpt-image-2-official 不输出真 RGBA(写棋盘格在 RGB),且 transparent prompt 触发漏画。**否决**
- ~~路径 ② 后处理~~:白底 + koukoutu/threshold 抠图 → 抠穿元素内部白色。**否决,结构性死路**
- ✅ **v11 路径**:绿幕 + 本地 chroma green key → UI 元素内不出现绿色 → 抠不穿

scipy split_elements.py 这一步本身在 v10/v11 都验证 work,gap=15 切片粒度对。

---

## 反面教材清单(后续不要再尝试)

- ❌ 让 gpt-image-2-official 直接出真 RGBA(模型不输出 alpha 通道)
- ❌ 白底 Pass 2 + 任何抠图(white-threshold / koukoutu / rmbg / SAM 都抠穿元素白色)
- ❌ Pass 2 prompt 加 hard rules / TRUST SOURCE / pixel-faithfully(触发 regenerate,v2 教训)
- ❌ Pass 2 prompt 塞 entity_name / bbox / JSON / 字段名(v1/v3 教训)
- ❌ backup `gpt-image-2`(必须 `gpt-image-2-official` + quality=high)
- ❌ 手写 BFS connected component(用 scipy ndimage)
- ❌ per-crop 单独 koukoutu(v9-A 抠穿 chip 白底)
- ❌ 二次喂 Gemini 检 bbox(split_elements 够用)

---

## 实际 v10/v11 输出位置

- `outputs/v10-A-transparent.png` — 分支 A 假 RGBA 棋盘格(反例)
- `outputs/v10-B-white.png` — 分支 B 白底原图(无用,被 v11 否)
- `outputs/v10-B-keyed.png` — local-threshold 抠后(看似 OK 实际抠穿 chip 白底)
- `outputs/v10-B-koukoutu.png` — koukoutu 抠后(同上)
- ✅ **`outputs/v11-green.png`** — Pass 2 终版输出(绿幕 + 11/11 元素)
- ✅ **`outputs/v11-keyed.png`** — chroma key 后透明 PNG
- ✅ **`outputs/v11-elements/element_001..011.png`** — 11 块完美切片(终版产物)

---

## 历史成本统计

| 阶段 | 调用 | 成本 |
|---|---|---|
| v1-v9 | ~25 次 Pass 2 + 多次 koukoutu | ~$0.5 |
| v10 (A+B) | 2 × Pass 2 + koukoutu × 2 | $0.34 |
| v11 (锁定) | 1 × Pass 2 | $0.17 |
| **总** | | **~$1.0** |

---

## 给未来 PoC 的启示

1. **看图,不只看数字**(v1 PoC 时被 alpha % 骗过)
2. **多 PoC 让模型试错代替建模型**(v11 数量明示治漏画 = prompt 工程,不是模型问题)
3. **判别色对抠图至关重要**(白色 vs 绿色,差一个色域决定结构性死路 vs 完美方案)
4. **scipy 比手写 BFS 强**(binary_dilation 桥接断裂这一步关键)

