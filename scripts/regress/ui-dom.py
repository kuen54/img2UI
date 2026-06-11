#!/usr/bin/env python3
"""UI smoke 的 DOM 检查器(配合 ui-smoke.sh,输入是 Chrome --dump-dom 的 HTML)。

关键点:断言跑在「可见文本」上 —— 解析时剥掉 script/style/template/noscript
的内容再判。绝不能拿整个 HTML 直接 grep:Next.js 的 RSC payload / 内联 script
里全是 pass1_run_id 之类的合法英文字段名。
(html.parser 把 script 内容当 CDATA 文本,不会把里面的字符串误解析成标签,
 所以属性扫描 aria-label 也是安全的。)

用法:ui-dom.py <dump.html> <子命令> [参数...]
  no-banned-terms            可见文本无英文术语直出(整词,允许 PNG/CDN 等技术名词)
  contains <文本>...         可见文本包含全部给定子串
  primary-button <文本>      恰好 1 个 MuiButton-contained 按钮,且其文本含 <文本>
  menu-collected <必有aria> <禁有aria>...
                             存在 aria-label=<必有> 的元素(MoreMenu 触发钮),
                             且不存在 aria-label 为任一 <禁有> 的裸按钮
失败时 exit 1 并在 stdout 给出原因。
"""

from __future__ import annotations

import re
import sys
from html.parser import HTMLParser

SKIP_TAGS = {"script", "style", "template", "noscript"}

# 整词边界用 lookaround 而非 \b:Python re 把中文也算 \w,「用Pass 1分析」这种
# 中英相邻 \b 会漏判;同时把 - 划进单词字符,合法复合词(z-index / asset-review
# 之类出现在文本里时)不被孤立整词误杀。PNG/CDN/SVG/URL/API/LLM/bbox 等允许的
# 技术名词与下列 pattern 天然无交集,不需要白名单。
WORD = r"[A-Za-z0-9_-]"
BANNED = [
    (r"pass\s*1", "「Pass 1」"),
    (r"pass\s*2", "「Pass 2」"),
    (r"element\s+review", "「Element Review」"),
    (r"asset\s+review", "「Asset Review」"),
    (r"validate", "「Validate」"),
    (r"assets?", "孤立整词「asset」"),
    (r"slices?", "孤立整词「slice」"),
]


class DomCollector(HTMLParser):
    """单遍收集:可见文本节点 / 全部元素属性 / contained 按钮的内文。"""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.skip_depth = 0
        self.texts: list[str] = []
        self.attrs: list[dict[str, str]] = []
        self.contained_texts: list[str] = []
        self._btn_buf: list[str] | None = None
        self._btn_tag = ""  # MUI Button 带 component={Link} 时渲染成 <a>,不只 <button>
        self._btn_depth = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in SKIP_TAGS:
            self.skip_depth += 1
        d = {k: (v or "") for k, v in attrs}
        self.attrs.append(d)
        if self._btn_buf is not None:
            if tag == self._btn_tag:  # 同名标签嵌套计数(button/a 实际不会嵌套)
                self._btn_depth += 1
        elif "MuiButton-contained" in d.get("class", ""):
            self._btn_buf = []
            self._btn_tag = tag
            self._btn_depth = 1

    def handle_endtag(self, tag: str) -> None:
        if tag in SKIP_TAGS and self.skip_depth:
            self.skip_depth -= 1
        if self._btn_buf is not None and tag == self._btn_tag:
            self._btn_depth -= 1
            if self._btn_depth == 0:
                self.contained_texts.append("".join(self._btn_buf).strip())
                self._btn_buf = None

    def handle_data(self, data: str) -> None:
        if self.skip_depth:
            return
        if data.strip():
            self.texts.append(data.strip())
        if self._btn_buf is not None:
            self._btn_buf.append(data)


def main() -> int:
    if len(sys.argv) < 3:
        print(f"用法:{__doc__}")
        return 2
    dump_file, cmd, args = sys.argv[1], sys.argv[2], sys.argv[3:]
    dom = DomCollector()
    with open(dump_file, encoding="utf-8", errors="replace") as f:
        dom.feed(f.read())
    visible = "\n".join(dom.texts)
    if not visible.strip():
        print("可见文本为空(页面可能没渲染出来)")
        return 1

    if cmd == "no-banned-terms":
        hits = []
        for pat, label in BANNED:
            m = re.search(rf"(?<!{WORD})(?:{pat})(?!{WORD})", visible, re.IGNORECASE)
            if m:
                line = next(t for t in dom.texts if m.group(0) in t)
                hits.append(f"{label} 出现在可见文本:「{line[:80]}」")
        if hits:
            print(";".join(hits))
            return 1
        return 0

    if cmd == "contains":
        missing = [t for t in args if t not in visible]
        if missing:
            print("可见文本缺少:" + "、".join(f"「{t}」" for t in missing))
            return 1
        return 0

    if cmd == "primary-button":
        expected = args[0]
        n = len(dom.contained_texts)
        if n != 1:
            print(f"期望恰 1 个 MuiButton-contained,实际 {n} 个:{dom.contained_texts}")
            return 1
        if expected not in dom.contained_texts[0]:
            print(f"主按钮文本期望含「{expected}」,实际「{dom.contained_texts[0]}」")
            return 1
        return 0

    if cmd == "menu-collected":
        must, forbidden = args[0], args[1:]
        labels = [a.get("aria-label", "") for a in dom.attrs if "aria-label" in a]
        if must not in labels:
            print(f"缺少 aria-label=「{must}」的 MoreMenu 触发按钮")
            return 1
        bad = [f for f in forbidden if f in labels]
        if bad:
            print("仍存在裸危险按钮 aria-label:" + "、".join(f"「{b}」" for b in bad))
            return 1
        return 0

    print(f"未知子命令:{cmd}")
    return 2


if __name__ == "__main__":
    sys.exit(main())
