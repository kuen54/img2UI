# Phase 0 PoC v2 最终报告

> 2026-05-13 重做版,纠正 v1 的错误判断,基于真实奶茶盲盒抽中页 + sankuai gateway (Gemini) + apimart (gpt-image-2)

## 结论 TL;DR

**✅ PoC v2 PASS,端到端 pipeline 全链路验证通过。**

最终架构:
- **Pass 1**: sankuai gateway 的 `gemini-3.1-pro-preview` (vision + thinking)
- **Pass 2**: apimart `gpt-image-2`,**opaque 白底输出**(不是 transparent),"trust source not description" prompt
- **抠图**: 本地 `white-threshold + smooth`,**0 API 依赖**
- **切片**: connected component(本地)

**v1 的错误已纠正**:
- ❌ 撤销「Pass 2 直接出 transparent」(transparent prompt 导致模型 regenerate 而非 extract,文字+风格全漂)
- ❌ 撤销「含文字 = type=code」反直觉规则(opaque 模式下文字保留正常,该规则没必要)
- ❌ 撤销「Pass 1 用 gpt-4o」(gemini 3.1 pro 在元素粒度、CJK 准确度上完爆 gpt-4o)

## v1 → v2 关键纠错

| 维度 | v1(错的) | v2(对的) | 触发 |
|---|---|---|---|
| Pass 2 背景 | transparent(模型 regenerate) | **opaque 白底**(模型 extract) | 用户指出 probe C 风格漂移严重 |
| 文字保留 | gpt-image-2 不能保 CJK,所以含文字=code | gpt-image-2 在 **opaque 模式下** CJK 完美保留 | probe B 检视复盘 |
| Pass 1 模型 | gpt-4o(15 元素,CJK 误读) | gemini-3.1-pro-preview(31 元素,CJK 0 错) | 用户推荐 |
| Pass 2 prompt | 描述驱动 | **以原图为视觉真相,描述只定位** | 修复 chips「白底粉边」误画 |
| 抠图依赖 | 需要 segmenter API 兜底 | **本地 threshold 即可,0 API** | probe B threshold 验证有效 |

## 端到端 pipeline 验证

### Step 1:Pass 1 — gemini-3.1-pro-preview

```
sankuai gateway: POST /v1/openai/native/chat/completions
Auth: 1983731511187542037 (无 Bearer)
Model: gemini-3.1-pro-preview
Body: { stream: false, response_format: json_object,
        max_tokens: 12000, extra_body.google.thinking_budget: 4096 }
```

**结果**:31 元素(11 static + 20 code),47s,$~0.02/调用

CJK 准确度对比:
| 元素 | gpt-4o (v1) | gemini (v2) | 真值 |
|---|---|---|---|
| chip 1 | "黑糖珍珠" ✓ | "黑糖珍珠" ✓ | 黑糖珍珠 |
| chip 2 | "Q弹芋圆" ❌ | "Q弹厚乳" ✓ | Q弹厚乳 |
| chip 3 | "椰果脆波波" ❌ | "经典奶茶系" ✓ | 经典奶茶系 |
| description | "黑糖珍珠，越喝越有底气" 部分对 | "黑糖珍珠，越嚼越有底气" 完全对 | 黑糖珍珠，越嚼越有底气 |
| 商品标题 | 缺失 | "奈雪的茶 \| 黑糖珍珠水牛乳(熔岩黑糖)" 完整 | 同 |
| 「附近可点同款」 | 漏 | 完整识别 | 同 |
| 「购买后自动领取」「完单可收藏潮玩」 | 漏 | 都识别 | 同 |

gemini 优势:
- thinking_budget = 4096 → 内部推理,输出更精准
- CJK 视觉理解显著优于 gpt-4o
- 元素粒度更细(每个商品卡内的子字段都识别)
- 给出 type_reasoning 解释分类依据

注意点:bbox 默认用 pixel 坐标(prompt 没强调归一化),前端实施时需在 prompt 里显式要求 normalized 0-1

### Step 2:Pass 2 — apimart gpt-image-2(opaque 白底)

```
apimart: POST /v1/images/generations (async, task_id polling)
Auth: Bearer sk-...
Body: {
  model: "gpt-image-2",
  prompt: <opaque-white-bg-prompt>,  // 见下
  image_urls: ["data:image/png;base64,..."],
  size: "1:1",
  resolution: "1k"
}
```

**关键 prompt 模式**(`prompts/pass2-real-v2.txt`):
```
TASK: From the source image, extract the listed elements onto a clean white background.
The source image is your ONLY source of truth for visual style — descriptions below merely
identify WHICH element to extract.

VISUAL FIDELITY (highest priority):
- Copy each element from the source image PIXEL-FAITHFULLY
- If the description and the source disagree about a visual detail, TRUST THE SOURCE IMAGE
- Do NOT reinterpret, restyle, or 'improve' the design
- Preserve EVERY Chinese/English character exactly as drawn in the source
...
```

**结果**:11 个 static 元素全部出现(含 2 个奶茶杯、3 个粉色 chip、解签印章、SUPER 徽章、娃娃、2 挂钩、异形容器、商品图),CJK 文字 100% 保留,风格高保真。40s/调用,$0.006

视觉证据:`outputs/v2-pass2-real-v2-decoded.png`

### Step 3:抠图 — 本地 white-threshold

```python
import numpy as np
from PIL import Image, ImageFilter

img = np.array(Image.open(opaque_png).convert('RGB'))
white = np.array([255, 255, 255])
diff = np.linalg.norm(img.astype(np.int32) - white, axis=-1)
alpha = np.clip((diff - 25) / 35, 0, 1) * 255   # 距离 < 25 全透明,> 60 全不透明
alpha = np.array(Image.fromarray(alpha.astype(np.uint8)).filter(ImageFilter.SMOOTH))
rgba = np.dstack([img, alpha])
```

**结果**:69.4% 透明 + 15.7% 完全不透明 + 14.9% 半透明边缘(平滑过渡)。**0 API 调用,~1s 处理**

视觉证据:`outputs/v2-pass2-keyed.png`

**MVP 已知边界 case**:
- 元素含纯白像素(如白色 t-shirt、白色高光)→ 会被误抠成透明洞 → MVP 接受,Asset Review 让用户手动覆盖上传
- 极浅色背景(浅灰、浅米)→ threshold 阈值需要调,提供 UI slider
- 复杂半透明边缘(玻璃、阴影)→ threshold 在边缘有 banding → 上 rmbg 或 SAM 是 v1 优化,MVP 不做

### Step 4:切片 — connected component

```python
# scripts/slice.py: BFS connected components on alpha > 32
# 过滤面积 < 1500 像素
# 按 (y_center, x_center) 排序
```

**结果**:16 个连通块(预期 11 元素)
- ✅ 主要元素干净切出:doll、SUPER、3 个 chip、解签、2 杯奶茶、异形 frame
- ⚠️ 异形 frame 内部白色镂空被 threshold 抠透明,导致局部分裂(notch 顶部、内部 cavity)
- ⚠️ 一些半透明小片(< 1500 px filter 兜底,实际不影响)

**MVP 解决方案**:Asset Review UI 让用户手动「合并」相邻碎块为一个 asset,或调高 min-size 阈值(代价:可能漏掉小元素)。这是 known boundary case,不阻断

## 视觉证据(对比)

详见 `poc/outputs/`:

| 文件 | 说明 |
|---|---|
| `inputs/canonical-512.png` | 原始测试图 |
| `apimart-C-multi-trans-decoded.png` | **v1 错误路径**(transparent prompt → 风格漂移 + 文字乱码) |
| `apimart-B-multi-decoded.png` | **v1 正确路径**(opaque 白底,但只测了 6 元素) |
| `apimart-B-threshold-keyed.png` | v1 路径下 threshold 抠图结果(可用) |
| `gemini-pass1-v3-parsed.json` | **v2 Pass 1 输出**(31 元素结构化) |
| `v2-pass2-real-v2-decoded.png` | **v2 Pass 2 输出**(11 元素 opaque 白底,高保真) |
| `v2-pass2-keyed.png` | **v2 抠图结果**(透明背景版) |
| `v2-slices/slice-{00..15}.png` | **v2 单元素切片**(主要元素质量高) |

## 总成本

| 项目 | API 次数 | 成本 |
|---|---|---|
| sankuai Gemini Pass 1 | 3 次(ping + v2 + v3) | 免费(用户 quota) |
| apimart gpt-image-2 Pass 2 | 6 次(probes A-D + v2 real x2) | ~$0.04 |
| 本地处理(threshold + slice) | 0 | 0 |
| **合计** | 9 次 | **$0.04** |

## 架构最终决定(影响后续 PRD/SPEC/CLAUDE/PLAN)

### 1. Pass 1 默认 provider

- **MLLM kind = sankuai-gemini**(api_format='openai'走 chat completions,但 base_url 是 `https://aigc.sankuai.com/v1/openai/native`,auth 不带 Bearer)
- 模型: `gemini-3.1-pro-preview`
- max_tokens 至少 8000,thinking_budget 1024-4096
- response_format: json_object
- 备选:OpenAI 直连 GPT-4o(api_format='openai',Bearer auth)

### 2. Pass 2 默认 provider

- **ImageGen kind = apimart-gptimage2**(api_format='apimart',is_async=true,task polling)
- 模型: `gpt-image-2`
- 输入参考图通过 `image_urls` 字段(base64 with `data:image/png;base64,` 前缀)
- **prompt 强制用 opaque 白底,绝不用 transparent**

### 3. 抠图(新增 pipeline 步骤,但**无需 provider**)

- 本地 white-threshold + edge smooth(用 sharp 或 PIL 等价)
- 阈值参数:近白距离 < 25 全透,> 60 全不透,中间渐变
- 提供 UI 滑块让用户调阈值(应对浅色背景元素)
- v1 后续可加 rmbg 作为 fallback

### 4. CLAUDE.md 撤销「含文字=code」反直觉规则

opaque 白底模式下 CJK 完美保留(probe B + v2-real-v2 双重验证)。chip / 印章 / 徽章如果是装饰性图形(text-as-graphic 风格),归 static 是对的。**只有内容性文字块(标题、价格、描述)才归 code**——这是普通的语义判断,不是反直觉规则

### 5. SPEC Pass 1 / Pass 2 prompt 模板更新

- Pass 1: 用 `prompts/pass1-system-v3.txt` 的版本(去掉「CJK = code」规则)+ 显式要求 normalized bbox
- Pass 2: 用 `prompts/pass2-real-v2.txt` 的「TRUST SOURCE NOT DESCRIPTION」模式

## Phase 0 v2 退出准则

| 准则 | 状态 |
|---|---|
| Pass 1 输出严格 JSON,元素粒度 ≥ 12 | ✅ 31 元素 |
| Pass 1 CJK 准确度高 | ✅ Gemini 0 错 |
| Pass 2 输出元素分离干净 + 风格保留 | ✅ 11/11 出现,CJK 0 错 |
| 抠图能产出可用透明 PNG | ✅ 本地 threshold 工作 |
| 切片能拆出独立元素 | ✅ 主要元素干净切出 |
| 端到端 pipeline 跑通 | ✅ 跑通 |

## 下一步

**进入 Phase 1 项目骨架**。Phase 0 v2 产出物全部保留在 `poc/`,Phase 4/5 实施时直接复用 prompt 模板和参考脚本

文档同步任务清单(下一步要做):
1. CLAUDE.md 撤销反直觉强约束 6,降级为 5 条
2. CLAUDE.md 加新约束(可作为约束 6):「Pass 2 prompt 必须强调以原图为视觉真相」+「抠图走本地 threshold,segmenter 是可选 v1」
3. SPEC Pass 1 prompt 改成 v3,emphasize normalized bbox
4. SPEC Pass 2 prompt 改成 v2 real(trust source)
5. SPEC Provider 默认 seed 改成 sankuai-gemini + apimart-gptimage2 双默认
6. SPEC Provider abstraction 加 sankuai 类型(api_format='openai' 但 auth 无 Bearer 前缀)
7. SPEC 加抠图 pipeline 步骤(`lib/alpha-key.ts`),不需要 segmenter provider
8. PRD MVP-α 上线策略改成 sankuai + apimart 双 provider
9. PLAN Phase 0 标 v2 完成,Phase 5 资产提取部分加抠图步骤
