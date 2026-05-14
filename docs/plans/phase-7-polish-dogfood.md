# Phase 7:打磨 + dogfood(子 plan)

> **状态**:🟡 dogfood 已跑通,polish 进行中
> **目标**:dogfood-driven 打磨 — 真实跑通端到端后,修暴露的真问题,补单测覆盖,写 README,Playwright E2E mock 场景
> **退出**:MVP-α 退出准则达成 — 一个新工程师 30 分钟内能跑出 Export
> **预估**:已花 0.5 天 dogfood,剩余 1.5-2 天
> **配套文档**:[PLAN.md](../../PLAN.md) Phase 7 / [SPEC.md](../../SPEC.md) / [CLAUDE.md](../../CLAUDE.md)

---

## Dogfood 已完成(2026-05-14)

跑通 PoC `canonical-1024.png` 全链路,记录如下:

| 阶段 | 实测 | 备注 |
|---|---|---|
| Pass 1(sankuai/gemini-3.1-pro)| 119s | 38 elements(14 static / 24 code) |
| Pass 2(apimart gpt-image-2-official)| 221s | 14 asset 全产出,绿幕 chroma key 路径与 v11 一致 |
| Export folder + zip | < 1s | spec.md 质量极高,manifest.json cdn_url=null fallback 干净 |

## P0 已修(hotfix #8 已合 main)

- Pass 1 bbox 像素坐标 fallback 归一化
- default max_tokens 12k → 32k

## Phase 7 余下任务

### Task 7.1a:UI 错误态打磨(P1+P2)

**Files**:
```
src/components/pages/state-card.tsx 或 pipeline-stepper.tsx  # 加 retry 按钮
src/components/ui/sticky-save-bar.tsx                        # dirty 状态导出
src/components/settings/provider-card.tsx                    # Test Connection disabled 时加 tooltip
src/lib/api/states-client.ts                                 # 加 retryPass1Api / retryPass2Api(直接 POST 同 endpoint)
```

- [ ] **7.1a.1** state card 在 `pass1_failed` / `pass2_failed` 时显示「重试」按钮,点击 POST 同 pass endpoint
- [ ] **7.1a.2** Test Connection 按钮 disabled 时加 hover tooltip「先点保存」
- [ ] 五件套 + commit `feat(ui): Pass 1/2 失败 retry 按钮 + Test Connection dirty 提示`

### Task 7.2:单测补齐

**Files**:
```
src/lib/__tests__/pass1-runner.test.ts   # NEW
src/lib/__tests__/run-lock.test.ts       # NEW(若不存在)
src/lib/__tests__/mask.test.ts           # 检查 / 补全
```

- [ ] **7.2.1** `mergeElements`(把 `mergeWithExisting` 改名 export)单测:bbox 归一化分支(像素 / 已归一化)、cross-state 合并、新元素插入、name 冲突处理
- [ ] **7.2.2** `run-lock`:acquire / release / 冲突抛 RunLockConflictError
- [ ] **7.2.3** `mask`:边界 case(空字符 / 短字符 / 已遮罩字符)
- [ ] **7.2.4** slicer 单测已有,verify 覆盖到 binary_dilation + connected component
- [ ] 五件套 + commit `test: 补 pass1-runner / run-lock / mask 单测`

### Task 7.3:Playwright E2E mock 场景

**Files**:
```
e2e/end-to-end.spec.ts                   # NEW
playwright.config.ts                     # NEW(若不存在)
src/lib/llm-client.ts                    # 加测试 stub hook(IS_E2E_MOCK env var)
package.json                             # 加 playwright + script
```

- [ ] **7.3.1** 装 @playwright/test
- [ ] **7.3.2** 在 llm-client 加环境变量 `IS_E2E_MOCK=1` 时返回 fixture(`poc/inputs/canonical-1024.png` + `poc/outputs/v9b-pass1.json` + `poc/outputs/v11-elements/*.png` 作 stub)
- [ ] **7.3.3** e2e spec:create project → upload state → wait pass1 mock → element review canvas 渲染 → run pass2 mock → asset review → export folder → 验证产物
- [ ] 五件套 + commit `test(e2e): Playwright 端到端 mock 场景`

### Task 7.4:README.md

**Files**:
```
README.md                                # 重写
```

- [ ] 章节:
  - 项目是什么(一段话 + 链接 PRD/SPEC)
  - 安装(node 22+ / npm install / npm run dev)
  - 第一次配置(去 /settings/models 填两个 key — sankuai + apimart 链接)
  - 跑第一个页面(上传 PNG → Pass 1 自动跑 → review → Pass 2 → Asset Review → Export)
  - 故障排查(LLM 截断 → max_tokens / bbox 错位 → 已 hotfix / chroma key 阈值调节 → Asset Review)
  - 文档导航
- [ ] commit `docs: README quickstart`

---

## 不做的事

- ❌ **Task 7.5 真活动页 dogfood**(已用 PoC 跑过,如要嘉锟出真活动页另起一轮)
- ❌ chroma threshold slider / edge clean tool(SPEC 已规划但 v1 推迟,Phase 6 子 plan 已标 v1)
- ❌ 性能优化(Pass 2 221s 是 LLM 成本,不是代码瓶颈)
- ❌ 多状态对齐 dogfood(本次只有 1 state,跨状态实际需要 2-3 state 真实场景才能验证)

---

## Files 总览

```
docs/plans/phase-7-polish-dogfood.md   # NEW(本 plan)

src/components/
├── pages/state-card.tsx                # 改:加 retry 按钮
├── settings/provider-card.tsx          # 改:Test Connection tooltip
└── ui/sticky-save-bar.tsx              # 可选:dirty 状态导出

src/lib/__tests__/
├── pass1-runner.test.ts                # NEW
├── run-lock.test.ts                    # NEW(若不存在)
└── mask.test.ts                        # 验证

e2e/end-to-end.spec.ts                  # NEW
playwright.config.ts                    # NEW

README.md                               # 重写
```

---

**子 plan 版本**:v0.1 (2026-05-14)
**配套主 plan**:[PLAN.md](../../PLAN.md) Phase 7
**前置 phase**:Phase 6 ✅
**Hotfix 历史**:PR #8 (bbox 像素归一化 + max_tokens 32k)
