#!/usr/bin/env python3
"""PoC #2: Pass 1 5 路 only-{category} 单类质量验证

目的:验证 5 路 mllm 的方案中
- 每路严格性:返回元素是否真属于该 category(允许 < 10% 误判)
- 全量召回:5 路并集 ≥ v9b 1-shot baseline 元素数(不漏)
- 跨路重复识别率:典型元素被 1-2 路识别(不应 4+ 路重复返回)

5 路:subject / button / container / background / decoration

输出:poc1-pass1-{category}.json + poc1-pass1-summary.json
"""
import base64
import concurrent.futures
import json
import os
import sys
import time
import urllib.request
import urllib.error

ROOT = "/Users/lijiakun/Documents/img2UI/poc"
INPUT_IMAGE = os.path.join(ROOT, "inputs/canonical-512.png")
BASE_PROMPT_PATH = os.path.join(ROOT, "prompts/pass1-system-v9b.txt")
OUT_DIR = os.path.join(ROOT, "v12-multi-route/outputs")
BASELINE_PATH = os.path.join(ROOT, "outputs/v9b-pass1.json")
os.makedirs(OUT_DIR, exist_ok=True)

API_URL = "https://aigc.sankuai.com/v1/openai/native/chat/completions"
API_KEY = "1983731511187542037"  # NO Bearer prefix

CATEGORIES = {
    "subject": {
        "cn": "主体",
        "definition": """页面中最主要的视觉表达对象,用户第一眼会把它当成「主角」来理解。

A. 形象主体:IP / 角色 / 商品 / 奖品 / 3D 物件 / 卡通人物 / 吉祥物。
B. 文字符号主体:艺术字标题 / 异形标题 / 品牌字标 / 活动主标题 / 视觉化 slogan。

判断:用户复述这个页面时,会不会提到它?会 → 主体;不会 → 装饰。
主体 vs 容器:主体是被观看的对象,容器是承载对象的结构。
""",
    },
    "button": {
        "cn": "按钮",
        "definition": """具备明确点击行为,但由于造型/材质/动效/品牌感过强,无法用普通代码按钮实现的按钮资产。

包含:异形按钮 / 游戏化按钮 / 贴纸按钮 / 拟物按钮 / 复杂渐变按钮 / 高光扫光 / 复杂边框 / 3D 厚度 / 材质纹理 / 固定艺术字按钮 / 奖励领取 / 抽奖 / 开箱 / 强活动感 CTA。
不包含:普通圆角按钮 / 普通胶囊 / 普通文字链 / 普通 icon button / 普通 tab / 普通底部导航。

判断 4 点:异形? 复杂材质? 复杂状态? 是否情绪峰值的一部分?
""",
    },
    "container": {
        "cn": "容器",
        "definition": """承载内容、信息或主体的特殊视觉结构,且无法通过普通代码组件稳定还原。

包含:盒子 / 舞台 / 展示柜 / 异形弹窗 / 特殊卡片 / 不规则面板 / 票券 / 信封 / 卷轴 / 证书框 / 玻璃罩 / 包装盒 / 展示台 / 奖励框 / 特殊边框 / 特殊底板 / 复杂列表卡片底图 / 承载文字的异形标签底板 / 承载角色的场景平台。
不包含:普通圆角矩形卡片 / 普通白底弹窗 / 普通按钮 / 普通 tab / 纯装饰性星星彩带。

特征:有明确边界、把内容包起来、形成层级、需要和前端内容动态组合。
""",
    },
    "background": {
        "cn": "背景",
        "definition": """去除所有 UI 元素、主体、容器、装饰后,仍然存在的底层视觉环境。

包含:渐变背景 / 光晕背景 / 纹理 / 大面积色块 / 氛围光 / 背景噪点 / 远景场景 / 暗角 / 柔光 / 星空 / 云雾 / 草地 / 城市远景。
不包含:可点击按钮 / 承载文案的卡片 / 前景角色 / 主视觉物体 / 独立贴纸 / 星星彩带等可独立复用的小装饰。

判断:把它去掉后,页面还有没有主体和信息?如果有,只是整体氛围变弱,那它大概率是背景。
""",
    },
    "decoration": {
        "cn": "装饰",
        "definition": """不直接承担核心信息结构,也不是页面主体,但用于补充氛围、节奏、状态感、精致度的小型视觉资产。

包含:星星 / 彩带 / 高光 / 粒子 / 小物件 / 胶囊 / 气泡 / 徽章 / 纸屑 / 爱心 / 云朵 / 小花 / 光点 / 闪电 / 小箭头 / 印章 / 金币 / 钻石 / 角落贴纸 / 前景虚化物 / 扫光层 / 发光描边 / 辅助图标插画。

胶囊/气泡/徽章双归属:固定贴纸型 → 装饰;承载动态内容 → 容器。
装饰 vs 背景:装饰可单独复用,背景是整体底层。整片星空底图=背景;单个星星=装饰。
""",
    },
}


def build_prompt(category_key: str, base_prompt: str) -> str:
    cat = CATEGORIES[category_key]
    head = f"""[ONLY-{category_key.upper()} PASS]

This pass identifies ONLY {cat['cn']} ({category_key}) elements. Definition follows:

{cat['definition']}

DO NOT return elements of other categories (subject / button / container / background / decoration besides this one). If unsure whether an element belongs, lean toward NOT returning it. Other passes will handle other categories.

For elements you do return, still classify each as `static` or `code` per the rules below.

---

"""
    return head + base_prompt


def call_route(category_key: str, base_prompt: str, img_b64: str):
    system_prompt = build_prompt(category_key, base_prompt)
    payload = {
        "stream": False,
        "model": "gemini-3.1-pro-preview",
        "temperature": 1.0,
        "max_tokens": 12000,
        "response_format": {"type": "json_object"},
        "extra_body": {
            "google": {"thinking_config": {"include_thoughts": False, "thinking_budget": 4096}}
        },
        "messages": [
            {"role": "system", "content": system_prompt},
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": f"Page name: 奶茶盲盒-抽中页\nState: canonical\n\nThis is the [ONLY-{category_key.upper()}] pass. Return ONLY {category_key} elements. Be EXHAUSTIVE within this category. CRITICAL: bbox MUST be normalized 0-1 floats. Return JSON.",
                    },
                    {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{img_b64}"}},
                ],
            },
        ],
    }
    body = json.dumps(payload).encode()
    req = urllib.request.Request(
        API_URL,
        data=body,
        headers={
            "Authorization": API_KEY,
            "Content-Type": "application/json",
        },
        method="POST",
    )
    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=240) as resp:
            raw = resp.read().decode()
    except urllib.error.HTTPError as e:
        return {
            "category": category_key,
            "ok": False,
            "error": f"HTTP {e.code}: {e.read().decode()[:500]}",
        }
    elapsed = time.time() - t0

    out_raw_path = os.path.join(OUT_DIR, f"poc2-pass1-{category_key}-raw.json")
    with open(out_raw_path, "w") as f:
        f.write(raw)

    resp_data = json.loads(raw)
    content = resp_data["choices"][0]["message"]["content"]
    parsed = json.loads(content)
    elements = parsed.get("elements", [])

    out_parsed_path = os.path.join(OUT_DIR, f"poc2-pass1-{category_key}.json")
    with open(out_parsed_path, "w") as f:
        json.dump(parsed, f, ensure_ascii=False, indent=2)

    return {
        "category": category_key,
        "ok": True,
        "elapsed_s": round(elapsed, 1),
        "element_count": len(elements),
        "elements": elements,
        "saved": out_parsed_path,
    }


def main():
    with open(BASE_PROMPT_PATH) as f:
        base_prompt = f.read()
    with open(INPUT_IMAGE, "rb") as f:
        img_b64 = base64.b64encode(f.read()).decode()

    print(f"Image: {INPUT_IMAGE} ({len(img_b64)} chars b64)")
    print(f"Base prompt: {len(base_prompt)} chars")
    print(f"5 routes parallel...")

    routes = list(CATEGORIES.keys())
    results = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
        future_to_cat = {
            executor.submit(call_route, cat, base_prompt, img_b64): cat for cat in routes
        }
        for future in concurrent.futures.as_completed(future_to_cat):
            cat = future_to_cat[future]
            try:
                res = future.result()
                results[cat] = res
                if res["ok"]:
                    print(f"  [{cat}] {res['elapsed_s']}s, {res['element_count']} elements -> {res['saved']}")
                else:
                    print(f"  [{cat}] FAILED: {res.get('error')}")
            except Exception as e:
                print(f"  [{cat}] EXCEPTION: {e}")
                results[cat] = {"category": cat, "ok": False, "error": str(e)}

    # 摘要
    summary = {
        "image": INPUT_IMAGE,
        "routes": {
            cat: {
                "ok": r.get("ok", False),
                "elapsed_s": r.get("elapsed_s"),
                "element_count": r.get("element_count", 0),
                "elements": [
                    {"entity_name": e.get("entity_name"), "type": e.get("type"), "bbox": e.get("bbox")}
                    for e in r.get("elements", [])
                ],
            }
            for cat, r in results.items()
        },
    }

    # 跨路重复检测(IoU > 0.5)
    def bbox_iou(a, b):
        if not a or not b or len(a) != 4 or len(b) != 4:
            return 0.0
        ax, ay, aw, ah = a
        bx, by, bw, bh = b
        ix1, iy1 = max(ax, bx), max(ay, by)
        ix2, iy2 = min(ax + aw, bx + bw), min(ay + ah, by + bh)
        if ix2 <= ix1 or iy2 <= iy1:
            return 0.0
        inter = (ix2 - ix1) * (iy2 - iy1)
        union = aw * ah + bw * bh - inter
        return inter / union if union > 0 else 0.0

    all_elements = []
    for cat, r in results.items():
        if r.get("ok"):
            for e in r["elements"]:
                all_elements.append({"category": cat, **e})

    duplicates = []
    for i, e1 in enumerate(all_elements):
        for j, e2 in enumerate(all_elements):
            if i < j and e1["category"] != e2["category"]:
                iou = bbox_iou(e1.get("bbox"), e2.get("bbox"))
                if iou > 0.5:
                    duplicates.append(
                        {
                            "iou": round(iou, 2),
                            "a": {"category": e1["category"], "name": e1.get("entity_name")},
                            "b": {"category": e2["category"], "name": e2.get("entity_name")},
                        }
                    )

    summary["cross_route_duplicates"] = duplicates
    summary["total_elements_across_routes"] = len(all_elements)
    summary["unique_elements_estimated"] = len(all_elements) - len(duplicates)

    # baseline 比较
    if os.path.exists(BASELINE_PATH):
        with open(BASELINE_PATH) as f:
            baseline = json.load(f)
        baseline_count = len(baseline.get("elements", []))
        summary["baseline"] = {
            "path": BASELINE_PATH,
            "element_count": baseline_count,
            "v12_recall_ratio": round(summary["unique_elements_estimated"] / baseline_count, 2) if baseline_count else 0,
        }

    out_summary = os.path.join(OUT_DIR, "poc2-summary.json")
    with open(out_summary, "w") as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)
    print(f"\nSummary: {out_summary}")

    # 控制台打印关键摘要
    print(f"\n=== Summary ===")
    for cat, r in summary["routes"].items():
        if r["ok"]:
            print(f"  {cat:12s}: {r['element_count']} elements, {r['elapsed_s']}s")
        else:
            print(f"  {cat:12s}: FAILED")
    print(f"\nTotal elements across 5 routes: {summary['total_elements_across_routes']}")
    print(f"Cross-route IoU>0.5 duplicates: {len(duplicates)}")
    print(f"Unique elements estimated:      {summary['unique_elements_estimated']}")
    if "baseline" in summary:
        print(f"v9b baseline (1-shot):          {summary['baseline']['element_count']}")
        print(f"v12 / v9b recall ratio:         {summary['baseline']['v12_recall_ratio']}x")


if __name__ == "__main__":
    main()
