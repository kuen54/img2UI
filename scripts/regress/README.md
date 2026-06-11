# pipeline 回归测试

本地 mock mllm / image_gen,经**真实 HTTP API** 跑完整 pipeline。全程不调真实 LLM,
不花钱,约 2-4 分钟。改动 pass1/pass2/validate/re-extract/exporter/audit-job 后跑一遍。

```bash
bash scripts/regress/run.sh
```

## 覆盖场景

1. **Pass 1**:5 路 mock(subject/button 返回元素,其余空)→ IoU 合并 → 2 elements
2. **Pass 2 首跑**:真实 chroma key + slicer,keyed/切片落盘,`pass2_failed_categories=[]`
3. **重跑清理**:人工造幽灵 `-batch1` 文件 + 幽灵切片 → 重跑后全清;**已指派 asset 存活**(assets-bin copy)
4. **部分失败容忍**:注入 subject 路 500 → `pass2_failed_categories=['subject']`、状态仍 `pass2_done`;只重跑失败路 → 名单合并清空
5. **validate / re-extract**:走 beginAuditJob 统一锁路径,asset 写入校验结果 / 新切片自动指派
6. **Pass 1 重跑保护**:无 force → `409 ELEMENTS_EXIST`;force → elements 整批替换 + 孤儿 Asset 清理(`deleteAssetsNotIn`)
7. **export 门禁**:`missing_assets` 摘要 + spec.md 顶部「导出不完整」警告 + 孤儿 asset 过滤
8. **指派口径与缓存**:`assigned_static_elements` 交集口径(type→code 的遗留 asset 不计入)+
   指派/撤销落盘后 page-stats 5s TTL 缓存立即失效 + 撤销后用 `slice_source` 重放还原(png md5 一致)
9. **运行中删除保护**:run 持锁时 DELETE 页面/项目 → 409
10. **UI smoke**(`ui-smoke.sh` + `ui-dom.py`,无头 Chrome `--dump-dom` 静态 DOM;
    **无 Chrome 时整段跳过,不算失败**):五路由可见文本无英文术语直出(Pass 1/2、
    Element/Asset Review、Validate、孤立整词 asset/slice)/ pipeline 面板恰 1 个
    contained 主按钮(按当时数据状态断言到文本级)+「重跑」「产出」分区 / 危险操作
    收口(MoreMenu aria-label「更多操作」在、裸删除 IconButton 不在)/ stepper 中文阶段名。
    断言跑在**可见文本**上(剥 script/style/template 再判,RSC payload 里的英文
    字段名不误伤);断言失败先重 dump 一次再判(虚拟时间预算下的时序容忍)
11. **删除级联**:deletePage 级联删 Asset(json + png)+ state,deleteProject 收尾

## 机制

- `gen-images.mjs`:sharp 生成设计稿(白底红/蓝方块)+ 各路绿幕 PNG,运行时生成,不提交二进制
- `mock-llm.mjs`:一个 http server 同时模拟 openai chat(pass1 按 system prompt 里的
  category 返回 canned elements;validate 返回固定质量结果)和 openai image_gen
  (按 pass2 prompt 里的「的X类元素」选绿幕图);往 `$IMG_DIR/control.json` 写
  `{"failCategoriesCn":["主体"]}` 可注入指定路失败
- `run.sh`:备份并临时替换 `data/config.json` 为 mock providers(**结束后自动还原,
  含异常退出 trap**),自起 dev server 于 `:3999`、mock 于 `:4567`,测试项目结束后级联删除

## 注意

- config 有进程内缓存,所以测试自起独立 dev server;**测试期间不要重启你自己的 dev server**
  (重启会读到 mock config)
- 测试数据写在真实 `data/` 下(独立的项目 id),正常结束或异常退出都会清掉;
  若强杀(kill -9)残留,手动删该测试项目 + `cp` 还原 config 即可(备份在 mktemp 目录)
