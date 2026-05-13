#!/usr/bin/env python3
"""Pass 2 v4 runner: 4 variants with different background strategies.

A: transparent background
B: black #000000 background
C: gray-white checkerboard background
D: user-reference verbatim copy (transparent, conversational)
"""
import base64
import json
import os
import sys
import time
import urllib.request

ROOT = "/Users/lijiakun/Documents/img2UI/poc"
INPUT_IMAGE = os.path.join(ROOT, "inputs/canonical-512.png")
OUT_DIR = os.path.join(ROOT, "outputs")

API_BASE = "https://api.apimart.ai/v1"
API_KEY = "sk-SNsVuJCDEBDKIkcnEMu7S78dqvpYKoc6RG8mX6bi7dU1Wo1I"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit/537.36 Chrome/120.0.0.0"

PROMPTS = {
    "A-transparent": """我们来尝试一下，把这张图详细地拆解。请你识别这张图里所有可以单独抠出来的装饰性图片元素(比如卡通角色、装饰徽章、风格化标签、印章、3D 渲染的物体、产品图片),把它们单独提取到一张完全透明背景的图片上,元素之间不要重叠,保持每个元素原本的形状/颜色/光影/材质和所有文字内容不变。

对于普通的 UI 文字、按钮、容器框、产品卡片等可以用代码实现的东西,不要包含在内。

同主题或同类型的元素可以紧凑排布以提升效率。""",
    "B-black": """我们来尝试一下，把这张图详细地拆解。请你识别这张图里所有可以单独抠出来的装饰性图片元素(比如卡通角色、装饰徽章、风格化标签、印章、3D 渲染的物体、产品图片),把它们单独提取到一张【纯黑色 #000000 背景】的图片上,元素之间不要重叠,保持每个元素原本的形状/颜色/光影/材质和所有文字内容不变。

对于普通的 UI 文字、按钮、容器框、产品卡片等可以用代码实现的东西,不要包含在内。

注意:背景必须是均匀的纯黑色,方便后续抠图处理。""",
    "C-checker": """我们来尝试一下，把这张图详细地拆解。请你识别这张图里所有可以单独抠出来的装饰性图片元素(比如卡通角色、装饰徽章、风格化标签、印章、3D 渲染的物体、产品图片),把它们单独提取到一张【灰白相间棋盘格背景】的图片上(像 Photoshop 显示透明区域的那种灰白格),元素之间不要重叠,保持每个元素原本的形状/颜色/光影/材质和所有文字内容不变。

对于普通的 UI 文字、按钮、容器框、产品卡片等可以用代码实现的东西,不要包含在内。""",
    "D-userrefcopy": """我们来尝试一下，再把这张图详细地拆解并进行切图，以便用于真正的研发落地。你能不能把这张图里涉及到的一些图片元素,比如说 icon、装饰角色、徽章、标签、印章、3D 物体、产品图片,单独生成透明背景的图片?你也可以把同一主题的 icon 放在一张图里面来生成,这样可以提升我们的生成速度和效率。

注意:普通的文字、按钮、容器框等可以用代码实现的东西不需要包含。""",
}


def run_variant(name: str, prompt: str, img_b64: str) -> dict:
    print(f"\n{'='*60}\nVariant {name}\n{'='*60}")
    print(f"Prompt ({len(prompt)} chars):\n{prompt}\n")

    out_submit = os.path.join(OUT_DIR, f"v4-{name}-submit.json")
    out_poll = os.path.join(OUT_DIR, f"v4-{name}-poll.json")
    out_img = os.path.join(OUT_DIR, f"v4-{name}.png")

    payload = {
        "model": "gpt-image-2",
        "prompt": prompt,
        "image_urls": [f"data:image/png;base64,{img_b64}"],
        "size": "1:1",
        "resolution": "1k",
        "n": 1,
    }
    body = json.dumps(payload).encode()

    print("[1/3] Submitting...")
    req = urllib.request.Request(
        f"{API_BASE}/images/generations",
        data=body,
        headers={
            "Authorization": f"Bearer {API_KEY}",
            "Content-Type": "application/json",
            "User-Agent": UA,
            "Accept": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            submit_raw = r.read().decode()
    except urllib.error.HTTPError as e:
        print(f"HTTP {e.code}: {e.read().decode()}")
        return {"ok": False, "error": str(e)}

    with open(out_submit, "w") as f:
        f.write(submit_raw)
    submit = json.loads(submit_raw)
    if submit.get("code") != 200:
        print(f"submit failed: {submit}")
        return {"ok": False, "error": "submit_failed"}
    task_id = submit["data"][0]["task_id"]
    print(f"  task_id: {task_id}")

    print("[2/3] Polling...")
    time.sleep(12)
    final = None
    for i in range(30):
        elapsed = 12 + i * 5
        req = urllib.request.Request(
            f"{API_BASE}/tasks/{task_id}",
            headers={
                "Authorization": f"Bearer {API_KEY}",
                "User-Agent": UA,
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=15) as r:
                poll_raw = r.read().decode()
        except Exception as e:
            print(f"   poll error: {e}")
            time.sleep(5)
            continue
        poll = json.loads(poll_raw)
        status = poll.get("data", {}).get("status", "unknown")
        print(f"  poll #{i+1} ({elapsed}s) status={status}")
        if status in ("completed", "succeeded", "success"):
            final = poll
            break
        if status in ("failed", "error"):
            print(json.dumps(poll, ensure_ascii=False)[:1500])
            return {"ok": False, "error": "task_failed"}
        time.sleep(5)

    if not final:
        return {"ok": False, "error": "timeout"}

    with open(out_poll, "w") as f:
        json.dump(final, f, ensure_ascii=False, indent=2)

    print("[3/3] Downloading...")
    images = final["data"]["result"]["images"]
    img_obj = images[0]
    url = img_obj.get("url")
    if isinstance(url, list):
        url = url[0]
    print(f"  URL: {url}")

    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        data = r.read()
    with open(out_img, "wb") as f:
        f.write(data)
    print(f"  Saved: {out_img} ({len(data)} bytes)")
    return {"ok": True, "path": out_img, "url": url}


def main():
    with open(INPUT_IMAGE, "rb") as f:
        img_b64 = base64.b64encode(f.read()).decode()
    print(f"Input image base64: {len(img_b64)} chars")

    # Allow filtering by argv
    targets = sys.argv[1:] if len(sys.argv) > 1 else list(PROMPTS.keys())

    results = {}
    for name in targets:
        if name not in PROMPTS:
            print(f"unknown variant: {name}")
            continue
        try:
            results[name] = run_variant(name, PROMPTS[name], img_b64)
        except Exception as e:
            print(f"  variant {name} crashed: {e}")
            results[name] = {"ok": False, "error": str(e)}

    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)
    for name, r in results.items():
        print(f"  {name}: {r}")


if __name__ == "__main__":
    main()
