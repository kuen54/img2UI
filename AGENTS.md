# Agent / Dev Workflow

img2UI 仓库的开发协议:分支命名 / PR / commit / tag / CHANGELOG / Plan-外偏离 / AI 协议

> 项目架构 / 数据流 / 资源 CRUD → [`SPEC.md`](./SPEC.md)。产品定位与决策 → [`PRD.md`](./PRD.md)。反直觉强约束 → [`CLAUDE.md`](./CLAUDE.md)

## 1. 分支命名

`feat/` 新特性 · `fix/` bug · `refactor/` 不改行为重构 · `tune/` 只改参数 · `docs/` 纯文档 · `archive/` 归档已放弃方案 · `test/` 仅测试 · `chore/` 配置/脚本 · `poc/` 临时验证(实施前的技术验证)

slug 用 kebab-case + **语义化**(`pass2-extraction-poc`、`element-review-bbox-drag`),**不**写 `bugfix-1` 这种

## 2. PR 流程

非 trivial 改动(>3 文件 或 改变行为)必走 feature branch + PR:

1. `git checkout -b <type>/<slug>`
2. 本地验证:`npx tsc --noEmit && npm test && npm run lint && npm run build`(UI 改动加 `npm run test:e2e`)
3. `git push -u origin <type>/<slug>` → `gh pr create`
4. PR description 必含 4 段:**改了什么 / 为什么 / 怎么验证 / 向后兼容风险**
5. Merge:`gh pr merge <n> --merge`(**不要** squash —— 保留 branch commits 让 tag-on-merge-commit 语义稳定);merge 后 `git branch -D <branch>`

可直接 push main 的例外:typo / comment 清理 / CHANGELOG 微调。任何行为改动哪怕一行都走 PR

## 3. Commit message

```
<type>(<scope>): <subject>

<body>

Co-Authored-By: ...
```

- type: feat / fix / refactor / tune / docs / chore / test / perf / style / build / ci / poc
- scope: 受影响主模块(`config` / `pipeline` / `element-review` / `asset-review` / `export` / `cdn` / `ui`),没有就省
- subject: 命令语气 / 小写开头 / < 70 字符
- body 解释**为什么**(diff 自己说做了什么)

## 4. Tag + CHANGELOG

**版本号是松散里程碑,不是 semver**——本项目无外部 consumer,tag 是稳定点 + release notes 锚点

`vX.Y.Z`:X 重大架构(MVP 阶段一直 0.\*)/ Y 整块新能力 / Z 增量 / 调优 / hotfix

何时打 tag:merge 后观察一两天稳定再打,或修 broken tag 的真 hotfix。**不要**每个 PR 都 tag、不要"以为做完了"瞬间 tag、不要 48h 内同特性 3 个 tag。Tag **永远放 merge commit 上**:

```bash
git checkout main && git pull
git tag -a v0.X.Y -m "v0.X.Y · <summary>" <merge-commit-sha>
git push origin v0.X.Y
gh release create v0.X.Y --title "..." --notes-file /tmp/notes.md
```

Broken tag:`git tag -d v0.X.Y && git push origin :refs/tags/v0.X.Y` + CHANGELOG 加 `> Note` 标注(**不**重写历史)+ `gh release delete --cleanup-tag=false`

**CHANGELOG**([Keep a Changelog](https://keepachangelog.com/en/1.1.0/)):开发期间往 `[Unreleased]` 攒草稿;tag 时改为 `[X.Y.Z] — <date> · <summary>` + 顶部补新 `[Unreleased]`;同特性多轮 tune 合并到一个条目 `### Tuning`,**不**拆多版本。**不**当 commit log;**不**为每个 PR 写一条;`[Unreleased]` 攒了就消化别堆

## 5. Standing rule · Plan-外 scope 偏离

PR 内任何**未在 PRD / SPEC / 对应 PLAN 声明**的额外测试 / 文档 / 重构 / 文件改动,必须在 PR description 顶部 `## Plan deviation` 段显式声明并给出理由。Reviewer 默认拒绝隐式 scope 扩张

合理偏离(指明命中哪条):

- (a) 防已识别风险回归
- (b) 量化 PRD/SPEC 声明却未具象化的契约(如 API shape)
- (c) 修复 PRD/SPEC 自身错漏(同时更新 PRD/SPEC)

不合理偏离(拆 follow-up PR):

- (a) 顺手清 unused 代码
- (b) "多测点总好"
- (c) 改公共 API 形态 / 引入新抽象 / 加新依赖

## 6. AI 协议

AI assistant(Claude Code / Cursor / Codex 等)身份工作时:

- 非 trivial 改动必走 branch + PR,**不**直接 push main
- 严禁**自合 PR**(review 通过也等用户决定)
- 严禁跳过 hooks / 签名(`--no-verify` / `--no-gpg-sign`),除非用户显式要求
- 严禁改 git config / force-push 到 main / `reset --hard` 公开历史
- 写代码前优先 plan,纯 refactor 也走 plan
- 大改前先 brainstorming 找方向;改完前跑 verification 五件套(`tsc --noEmit && npm test && npm run lint && npm run build && npm run knip`)
- plan 内可分配 task 给 subagent,但 **subagent 必须用 opus 模型**;PRD/SPEC/PLAN 类文档**必须 inline 由主对话写,严禁 dispatch**
- 文件注释默认**最少**:单行 max,只在 WHY 非 obvious 时写
- LLM prompt 模板的修改**必须**伴随 PoC 验证(用 `data/raw/` 下的真实测试图跑一遍),不接受"看起来更合理"的盲改

### img2UI 特有 AI 约束(扩展 evalyst 通用规则)

- **Pass 1 / Pass 2 / 校验 prompt 模板的修改必走 PR**,不接受 hotfix。理由:prompt 是产品契约,改一次就要在多个真实场景回归
- **新加 provider kind 必须更新 [SPEC.md § 数据 schema § Provider]** + UI 配置卡 + provider abstraction 分发逻辑,三处同步
- **不要**为提升单元素抠图质量去引入 SAM/segmenter 作为默认路径——它是 fallback,默认路径必须是 GPT-image-2 image-edit。如果改默认路径,先开 PRD 改设计
- **加任何「第三类」「混合类型」「特殊路径」前**,先看 [CLAUDE.md § 反直觉强约束 § 4],99% 情况下能用 LLM 一次性吸收掉

## 7. 回顾 / 审计

合完大 PR 后、tag 前:

1. 实测一轮(端到端跑通一个真实页面 + 1-2 edge case,如:元素重叠紧贴、单状态多元素 > 15、跨状态对齐失败)
2. 看 console:dev server 无 warning / error
3. 读自己 diff:dead code / stale 注释 / typo / doc drift
4. 发现问题开新 PR(`fix/` / `docs/`),别攒

系统审计:`tsc --noEmit && npm test && npm run lint && npm run build` 四件套(MVP 阶段先不上 knip)+ 端到端实测 + 读关键文件

## 8. 文档同步规则

- 改 API shape → 同步更新 [SPEC.md § API 契约]
- 改 Pass 1/2 prompt 模板 → 同步更新 [SPEC.md § Pass 1 / Pass 2 prompt 模板]
- 改数据 schema → 同步更新 [SPEC.md § 数据 schema] + 必要时写 migration
- 改产品交互 → 同步更新 [PRD.md § Use Case]
- 加新「反直觉决策」(MVP 决策、被砍方案、不做的事) → 同步更新 [CLAUDE.md § 反直觉强约束]
- 文档不同步是 **PR blocker**,不接受「这个之后再补」
