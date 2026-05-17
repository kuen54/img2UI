# img2UI CLAUDE.md

> 配套阅读:`PLAN.md`(本仓库)+ `../img2UI-archive/HANDOFF.md`(产品契约,在 archive 仓库)

## 工作准则
- HANDOFF.md 是产品契约。§13 反直觉硬约束 + §5.3.1 / §6.3.1 / §6.3.2 / §6.4 prompt 模板 + 附录 A category 定义都是逐字照抄,不要"觉得更合理"地改写
- **MVP 简化决策见 PLAN §0.4**(单 state per page / 小元素过滤 / 切片全手动指派),与 HANDOFF 不一致以 PLAN §0.4 为准
- TS strict + noUncheckedIndexedAccess + exactOptionalPropertyTypes;不引额外抽象层(无 DI / repository / event bus);Route Handler 直接调 lib 函数
- 不引 Tailwind;UI 用 **MUI v6 + Emotion**;主题在 `src/theme/index.ts` 一处管理;主色 `#0d99ff`(Figma 蓝),其他 MD3 token(大圆角 16 / ripple / elevation 1→3)保留
- 文件 IO 都走 `writeAtomic`;并发用 `src/lib/run-lock.ts` 内存锁
- 不要在 pipeline runner / pass2-runner 里 import matting-client;只有 `re-key-via-api` 路由 import(§13.7)
- 看到 Pass 1 prompt 出现 EXCLUSIVE 措辞(`Return ONLY` / `Do NOT return others`)立即回滚(§13.8)
- Pass 2 完成 **不**创建 Asset(MVP S3),只 `writeSlice`;Asset 是用户在 Asset Review 拖切片到 element 时产生的
- apimart `quality` **全程 `'high'`**,不退到 medium

## 实测收敛参数(不许动)
- mllm: `gemini-3.1-pro-preview` / `temperature=1` / `max_tokens=32000` / `thinking_budget=4096` / `api_format='sankuai'` 无 Bearer 前缀
- image_gen: `gpt-image-2-official`(**不**是 backup `gpt-image-2`)/ `quality='high'` / `poll_max_attempts=60` / `poll_initial_delay=12s`
- chroma key: `full_alpha=60` / `full_opaque=25` / spill suppression on
- slicer: `gap=15` / `padding=5` / `min_size=30` / `min_opaque_pct=1.0`
- Pass 1 合并: IoU > 0.5,优先级 `subject<button<container<background<decoration<other`,≥3/5 才算 done
- Element 大小过滤:相对面积 `< 0.001` 丢弃(写到 `PipelineRun.parsed_result.filtered_tiny[]` 留底)

## 不要做的事
- 不复用 `archive/src/lib/*` 任何代码
- 不重复 "三选一" 决策(已在 PLAN §1 定:MUI v6)
- 不引 OpenCV / scipy(slicer 自实现)
- 不在 PoC 评估时只看统计指标(必看 `keyed/{state}-{cat}.png` 实际像素质量)

## 仓库布局
- `src/lib/` — 业务逻辑(types / fs-utils / config / llm-client / pass1-runner / pass2-runner / slicer / alpha-key / slices / matting-client / cdn-client / exporter / prompts/* / seeds/* / visual-category)
- `src/app/api/` — Route Handlers,直接调 lib
- `src/app/` — 页面组件(MUI client components)
- `src/theme/` — MUI MD3 主题
- `src/components/` — 共用 UI 组件
- `src/middleware.ts` — CSRF gate(`Sec-Fetch-Site`)
- `data/` — 运行时数据(gitignored,首启动自动建)
- `poc/` — PoC v1-v12 实验数据(只读参考)
- `ref/` — 算法参考(`split_elements.py` / `generate_images_apimart.py`,只读)
