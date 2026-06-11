# UI smoke:无头 Chrome --dump-dom 静态 DOM 检查(被 run.sh source,不可独立运行)
#
# 在 pipeline 数据就绪、dev server 仍存活时由 run.sh 调用 ui_smoke。
# 依赖 run.sh 的 ok/fail/step 与 $PORT/$PROJ/$PAGE/$TMP。
# 覆盖:渲染层术语全中文(F)/ pipeline 面板唯一主按钮(G)与三区(H)/
#       危险操作收口 MoreMenu(I)/ stepper 中文阶段名(J)。
#
# Chrome 不存在时整段 skip 并打 warning(不算 fail),CI/无 Chrome 环境兼容。

UI_CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
UI_PY="scripts/regress/ui-dom.py"

# --virtual-time-budget:让 client 组件的 JS / fetch 在虚拟时间里跑完再 dump,
# 拿到的是渲染后的 DOM 而非空壳 HTML
ui_dump() { # $1=url $2=输出文件
  "$UI_CHROME" --headless=new --disable-gpu --hide-scrollbars --no-first-run \
    --virtual-time-budget=8000 --dump-dom "$1" > "$2" 2>/dev/null
}

# 断言带一次重试:--virtual-time-budget 截止时懒数据可能还没到,失败先怀疑时序,
# 重 dump 一次再判 fail;每条断言独立 ok/fail
ui_assert() { # $1=url $2=dump文件 $3=描述 $4...=ui-dom.py 子命令与参数
  local url="$1" f="$2" desc="$3" out
  shift 3
  if out=$(python3 "$UI_PY" "$f" "$@"); then ok "$desc"; return 0; fi
  ui_dump "$url" "$f"
  if out=$(python3 "$UI_PY" "$f" "$@"); then ok "$desc(重 dump 后通过)"; return 0; fi
  fail "$desc — ${out:-检查器无输出}"
  return 1
}

ui_smoke() {
  if [ ! -x "$UI_CHROME" ]; then
    echo "  ⚠ 未找到 Chrome($UI_CHROME),UI smoke 整段跳过(不计失败)"
    return 0
  fi

  local base="http://localhost:$PORT"
  # bash 3.2(macOS 自带)无关联数组,用平行数组
  local names=(home project page element-review asset-review)
  local urls=(
    "$base/"
    "$base/projects/$PROJ"
    "$base/projects/$PROJ/pages/$PAGE"
    "$base/projects/$PROJ/pages/$PAGE/element-review"
    "$base/projects/$PROJ/pages/$PAGE/asset-review"
  )
  local i
  # 预热:dev 按需编译,先 curl 触发编译,Chrome 的虚拟时间预算不吃首发编译
  for i in "${!urls[@]}"; do curl -s -o /dev/null "${urls[$i]}"; done
  for i in "${!urls[@]}"; do ui_dump "${urls[$i]}" "$TMP/dom-${names[$i]}.html"; done

  # F. 术语回归:五个路由可见文本无英文术语直出(Pass 1/2、Element/Asset Review、
  #    Validate、孤立整词 asset/slice;PNG/CDN/SVG/URL/API/LLM/bbox/z-index 放行)
  for i in "${!urls[@]}"; do
    ui_assert "${urls[$i]}" "$TMP/dom-${names[$i]}.html" \
      "术语回归(${names[$i]}):可见文本无英文术语直出" no-banned-terms
  done

  local page_url="$base/projects/$PROJ/pages/$PAGE"
  local page_dom="$TMP/dom-page.html"

  # G. 面板唯一主按钮:此刻 pass2_done 且 1/2 static 已指派(未全指派)→
  #    contained 主按钮恰 1 个且是「去指派素材」(全指派态会换成「导出文件夹」)
  ui_assert "$page_url" "$page_dom" \
    "面板唯一主按钮:恰 1 个 contained 且为「去指派素材」(未全指派态)" \
    primary-button "去指派素材"

  # H. 三区存在:Divider+overline 的「重跑」「产出」分区 + 重跑警示
  ui_assert "$page_url" "$page_dom" \
    "面板三区:可见「重跑」「产出」「重跑会覆盖现有结果」" \
    contains "重跑" "产出" "重跑会覆盖现有结果"

  # I. 危险操作收口:MoreMenu 触发钮(aria-label「更多操作」)在,
  #    裸删除 IconButton(aria-label「删除项目/删除页面」)不在
  ui_assert "$base/projects/$PROJ" "$TMP/dom-project.html" \
    "危险操作收口(项目详情):MoreMenu 在 + 无裸「删除项目」按钮" \
    menu-collected "更多操作" "删除项目"
  ui_assert "$page_url" "$page_dom" \
    "危险操作收口(页面详情):MoreMenu 在 + 无裸「删除项目/页面」按钮" \
    menu-collected "更多操作" "删除项目" "删除页面"

  # J. 矩阵/术语抽查:stepper 必然渲染的中文阶段名
  ui_assert "$page_url" "$page_dom" \
    "stepper 中文阶段名:可见「布局分析」「素材生成」" \
    contains "布局分析" "素材生成"
}
