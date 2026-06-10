#!/usr/bin/env bash
# img2UI pipeline 回归测试
#
# 本地 mock mllm / image_gen,经真实 HTTP API 跑完整 pipeline,
# 覆盖重跑语义 / 失败信号 / 孤儿清理 / export 门禁等关键路径。
# 全程不调真实 LLM,不花钱。约 2-4 分钟。
#
# 用法(repo 根目录):bash scripts/regress/run.sh
#
# 注意:
# - 会临时把 data/config.json 换成 mock providers(结束后自动还原,含异常退出)
# - 测试期间请勿手动启停你自己的 dev server(config 有进程内缓存)
# - 测试自己起一个 dev server 在 :3999,mock 在 :4567,不占用常规 :3000
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
PORT=3999
MOCK_PORT=4567
B="http://localhost:$PORT/api"
TMP="$(mktemp -d /tmp/img2ui-regress.XXXXXX)"
export IMG_DIR="$TMP"

PASS_N=0
FAIL_N=0
PROJ=""
DEV_PID=""
MOCK_PID=""
CONFIG_BACKED_UP=0

ok()   { PASS_N=$((PASS_N + 1)); echo "  ✓ $1"; }
fail() { FAIL_N=$((FAIL_N + 1)); echo "  ✗ FAIL: $1"; }
step() { echo; echo "── $1"; }

cleanup() {
  echo
  echo "── 清理"
  # 删测试项目(级联删 page/state/elements/assets/slices/pipelines)
  if [ -n "$PROJ" ]; then
    curl -s -o /dev/null -X DELETE "$B/projects/$PROJ" || true
  fi
  [ -n "$DEV_PID" ] && kill "$DEV_PID" 2>/dev/null
  [ -n "$MOCK_PID" ] && kill "$MOCK_PID" 2>/dev/null
  if [ "$CONFIG_BACKED_UP" = 1 ]; then
    cp "$TMP/config.backup.json" data/config.json
    echo "  config.json 已还原"
  fi
  rm -rf "$TMP"
  echo "  done"
}
trap cleanup EXIT

# 轮询 pipeline run 直到终态,echo 终态
wait_run() {
  local run_id="$1" s=""
  for _ in $(seq 1 150); do
    s=$(curl -s "$B/pipeline-runs/$run_id" | python3 -c "import json,sys;print(json.load(sys.stdin).get('status','?'))" 2>/dev/null || echo "?")
    [ "$s" != "running" ] && [ "$s" != "?" ] && { echo "$s"; return; }
    sleep 1
  done
  echo timeout
}

jget() { python3 -c "import json,sys;print(json.load(sys.stdin)$1)"; }

# ════ 环境准备 ════════════════════════════════════════════════════════════
step "环境准备"
if lsof -ti ":$PORT" > /dev/null 2>&1; then
  echo "端口 $PORT 被占用,先停掉再跑"; exit 1
fi

node scripts/regress/gen-images.mjs "$TMP"
cp data/config.json "$TMP/config.backup.json" 2>/dev/null || { echo "data/config.json 不存在,先启动过一次应用再跑"; exit 1; }
CONFIG_BACKED_UP=1

# 换成 mock providers(必须在 dev server 启动前,config 有进程内缓存)
python3 - "$MOCK_PORT" <<'EOF'
import json, sys
port = sys.argv[1]
c = json.load(open('data/config.json'))
now = '2026-01-01T00:00:00.000Z'
c['providers'] = [
  {'id':'mockmllm01','kind':'mllm','name':'mock-mllm','api_format':'openai',
   'base_url':f'http://localhost:{port}/v1','api_key':'mock-key','model':'mock-gpt',
   'default_temperature':1,'default_max_tokens':32000,'vision_capable':True,
   'active':True,'created_at':now,'updated_at':now},
  {'id':'mockimgen01','kind':'image_gen','name':'mock-imagegen','api_format':'openai',
   'base_url':f'http://localhost:{port}/v1','api_key':'mock-key','model':'mock-image',
   'endpoint_kind':'image_generation','is_async':False,'default_quality':'high',
   'active':True,'created_at':now,'updated_at':now},
]
json.dump(c, open('data/config.json','w'), ensure_ascii=False, indent=2)
EOF

rm -f "$TMP/control.json"
node scripts/regress/mock-llm.mjs > "$TMP/mock.log" 2>&1 &
MOCK_PID=$!
npx next dev -p "$PORT" > "$TMP/dev.log" 2>&1 &
DEV_PID=$!
for _ in $(seq 1 45); do
  curl -s -o /dev/null -w "%{http_code}" "$B/projects" 2>/dev/null | grep -q 200 && break
  sleep 1
done
curl -s -o /dev/null -w "%{http_code}" "$B/projects" | grep -q 200 || { echo "dev server 起不来,看 $TMP/dev.log"; exit 1; }
echo "  mock :$MOCK_PORT / dev :$PORT 已就绪"

# ════ 1. 建项目 + 上传 + Pass 1 ══════════════════════════════════════════
step "1. Pass 1:5 路 mock → IoU 合并"
PROJ=$(curl -s -X POST "$B/projects" -H 'Content-Type: application/json' -d '{"name":"回归测试项目","description":"mock 回归"}' | jget "['id']")
PAGE=$(curl -s -X POST "$B/projects/$PROJ/pages" -H 'Content-Type: application/json' -d '{"name":"回归页"}' | jget "['id']")
STATE=$(curl -s -X POST "$B/pages/$PAGE/states" -F "file=@$TMP/design.png;type=image/png" | jget "['id']")
export STATE PAGE

RUN=$(curl -s -X POST "$B/states/$STATE/pass1" | jget "['run_id']")
S=$(wait_run "$RUN")
[ "$S" = completed ] && ok "pass1 completed" || fail "pass1 $S"
curl -s "$B/pages/$PAGE/elements" | python3 -c "
import json,sys
els=json.load(sys.stdin)['elements']
assert len(els)==2, f'期望 2 elements, 得到 {len(els)}'
cats=sorted(e['visual_category'] for e in els)
assert cats==['button','subject'], cats
" && ok "2 elements(subject + button)" || fail "elements 断言失败"

# ════ 2. review + Pass 2 首跑 ═══════════════════════════════════════════
step "2. Pass 2 首跑:真实 chroma key + slicer"
curl -s "$B/pages/$PAGE/elements" | python3 -c "
import json,sys
d=json.load(sys.stdin)
for e in d['elements']: e['reviewed']=True
print(json.dumps(d))
" > "$TMP/els.json"
curl -s -X PUT "$B/pages/$PAGE/elements" -H 'Content-Type: application/json' -d @"$TMP/els.json" > /dev/null

RUN=$(curl -s -X POST "$B/states/$STATE/pass2" | jget "['run_id']")
S=$(wait_run "$RUN")
[ "$S" = completed ] && ok "pass2 completed" || fail "pass2 $S"
[ -f "data/keyed/$STATE-subject.png" ] && [ -f "data/keyed/$STATE-button.png" ] \
  && ok "keyed 文件落盘" || fail "keyed 文件缺失"
python3 -c "
import json,os
s=json.load(open(f\"data/states/{os.environ['STATE']}.json\"))
assert s['pipeline_status']=='pass2_done', s['pipeline_status']
assert s.get('pass2_failed_categories')==[], s.get('pass2_failed_categories')
" && ok "pass2_done + pass2_failed_categories=[]" || fail "state 断言失败"

# ════ 3. 重跑清理:幽灵产物 + 已指派 asset 存活 ══════════════════════════
step "3. 重跑清理:幽灵 batch/切片清掉,已指派 asset 存活"
RED_EL=$(curl -s "$B/pages/$PAGE/elements" | python3 -c "import json,sys;print([e['id'] for e in json.load(sys.stdin)['elements'] if e['name']=='红色方块'][0])")
export RED_EL
IDX=$(curl -s "$B/states/$STATE/slices?page_id=$PAGE" | python3 -c "import json,sys;print([s['idx'] for s in json.load(sys.stdin)['slices'] if s['category']=='subject'][0])")
curl -s -X POST "$B/elements/$RED_EL/assign-slice" -H 'Content-Type: application/json' \
  -d "{\"state_id\":\"$STATE\",\"category\":\"subject\",\"idx\":$IDX,\"page_id\":\"$PAGE\"}" > /dev/null

cp "data/keyed/$STATE-subject.png" "data/keyed/$STATE-subject-batch1.png"
cp "data/pass2/$STATE-subject.png" "data/pass2/$STATE-subject-batch1.png"
cp "data/slices/$STATE-subject/$IDX.png" "data/slices/$STATE-subject/99.png"
cp "data/slices/$STATE-subject/$IDX.json" "data/slices/$STATE-subject/99.json"

RUN=$(curl -s -X POST "$B/states/$STATE/pass2" | jget "['run_id']")
S=$(wait_run "$RUN")
[ "$S" = completed ] && ok "重跑 completed" || fail "重跑 $S"
[ ! -f "data/keyed/$STATE-subject-batch1.png" ] && [ ! -f "data/pass2/$STATE-subject-batch1.png" ] \
  && ok "幽灵 batch 文件已清" || fail "幽灵 batch 残留"
[ ! -f "data/slices/$STATE-subject/99.png" ] && ok "幽灵切片已清" || fail "幽灵切片残留"
[ -f "data/assets-bin/$RED_EL.png" ] && [ -f "data/assets/$RED_EL.json" ] \
  && ok "已指派 asset 在重跑后存活" || fail "已指派 asset 丢失"

# ════ 4. 部分失败信号 + 只重跑失败路 ══════════════════════════════════════
step "4. 部分失败:注入 subject 路 500"
echo '{"failCategoriesCn":["主体"]}' > "$TMP/control.json"
RUN=$(curl -s -X POST "$B/states/$STATE/pass2" | jget "['run_id']")
S=$(wait_run "$RUN")
[ "$S" = completed ] && ok "部分失败容忍:audit 仍 completed" || fail "audit $S"
python3 -c "
import json,os
s=json.load(open(f\"data/states/{os.environ['STATE']}.json\"))
assert s['pipeline_status']=='pass2_done', s['pipeline_status']
assert s.get('pass2_failed_categories')==['subject'], s.get('pass2_failed_categories')
" && ok "pass2_failed_categories=['subject'],状态仍 pass2_done" || fail "失败信号断言失败"
[ -f "data/assets-bin/$RED_EL.png" ] && ok "已指派 asset 不受失败影响" || fail "asset 丢失"

rm "$TMP/control.json"
RUN=$(curl -s -X POST "$B/states/$STATE/pass2" -H 'Content-Type: application/json' -d '{"categories":["subject"]}' | jget "['run_id']")
S=$(wait_run "$RUN")
[ "$S" = completed ] && ok "只重跑失败路 completed" || fail "重跑失败路 $S"
python3 -c "
import json,os
s=json.load(open(f\"data/states/{os.environ['STATE']}.json\"))
assert s.get('pass2_failed_categories')==[], s.get('pass2_failed_categories')
" && ok "失败名单合并清空" || fail "名单合并断言失败"
[ -f "data/keyed/$STATE-subject.png" ] && ok "subject keyed 恢复" || fail "subject keyed 缺失"

# ════ 5. validate + re-extract ════════════════════════════════════════════
step "5. validate / re-extract(beginAuditJob 路径)"
RUN=$(curl -s -X POST "$B/states/$STATE/validate" | jget "['run_id']")
S=$(wait_run "$RUN")
[ "$S" = completed ] && ok "validate completed" || fail "validate $S"
python3 -c "
import json,os
s=json.load(open(f\"data/states/{os.environ['STATE']}.json\"))
assert s['pipeline_status']=='validated', s['pipeline_status']
a=json.load(open(f\"data/assets/{os.environ['RED_EL']}.json\"))
assert a['status']=='validated' and a['alpha_quality']==0.95, (a['status'], a['alpha_quality'])
" && ok "validated + asset 写入校验结果" || fail "validate 断言失败"

RUN=$(curl -s -X POST "$B/elements/$RED_EL/re-extract?page_id=$PAGE" | jget "['run_id']")
S=$(wait_run "$RUN")
[ "$S" = completed ] && ok "re-extract completed" || fail "re-extract $S"
python3 -c "
import json,os
a=json.load(open(f\"data/assets/{os.environ['RED_EL']}.json\"))
assert a['slice_source']['idx'] > 0, a['slice_source']
" && ok "新切片自动指派(nextSliceIdx 追加)" || fail "re-extract 指派断言失败"

# ════ 6. Pass 1 重跑保护 + 孤儿清理 ═══════════════════════════════════════
step "6. Pass 1 重跑:409 保护 + force 替换 + 孤儿 asset 清理"
CODE=$(curl -s -o "$TMP/p1.json" -w "%{http_code}" -X POST "$B/states/$STATE/pass1")
[ "$CODE" = 409 ] && grep -q ELEMENTS_EXIST "$TMP/p1.json" \
  && ok "无 force → 409 ELEMENTS_EXIST" || fail "无 force 期望 409,得到 $CODE"

RUN=$(curl -s -X POST "$B/states/$STATE/pass1" -H 'Content-Type: application/json' -d '{"force":true}' | jget "['run_id']")
S=$(wait_run "$RUN")
[ "$S" = completed ] && ok "force 重跑 completed" || fail "force 重跑 $S"
curl -s "$B/pages/$PAGE/elements" | python3 -c "
import json,sys,os
els=json.load(sys.stdin)['elements']
ids=[e['id'] for e in els]
assert len(els)==2 and os.environ['RED_EL'] not in ids, ids
assert all(not e['reviewed'] for e in els)
" && ok "elements 整批替换为新 id" || fail "替换断言失败"
[ ! -f "data/assets/$RED_EL.json" ] && [ ! -f "data/assets-bin/$RED_EL.png" ] \
  && ok "孤儿 Asset + PNG 已清(deleteAssetsNotIn)" || fail "孤儿 asset 残留"

# ════ 7. export 完成度门禁 ════════════════════════════════════════════════
step "7. export:missing_assets + spec.md 警告"
curl -s -X POST "$B/pages/$PAGE/export" -H 'Content-Type: application/json' -d "{\"output_dir\":\"$TMP/export\"}" | python3 -c "
import json,sys
d=json.load(sys.stdin)
assert len(d['missing_assets'])==2, d['missing_assets']
assert d['orphan_assets_skipped']==0, d
" && ok "missing_assets=2,孤儿=0" || fail "export 断言失败"
grep -rq "导出不完整" "$TMP"/export/*/pages/*/spec.md \
  && ok "spec.md 顶部含不完整警告" || fail "spec.md 缺警告"

# ════ 结果 ════════════════════════════════════════════════════════════════
echo
echo "════════════════════════════════"
echo " 通过 $PASS_N / 失败 $FAIL_N"
echo "════════════════════════════════"
[ "$FAIL_N" = 0 ] || exit 1
