#!/usr/bin/env python3
"""v6 Step 1: Generate white-background layout image via apimart.
Use the user-specified prompt verbatim.
"""
import base64
import json
import os
import sys
import time
import urllib.request
import urllib.error

ROOT = "/Users/lijiakun/Documents/img2UI/poc"
INPUT_IMAGE = os.path.join(ROOT, "inputs/canonical-512.png")
OUT_DIR = os.path.join(ROOT, "outputs")

API_BASE = "https://api.apimart.ai/v1"
API_KEY = "sk-SNsVuJCDEBDKIkcnEMu7S78dqvpYKoc6RG8mX6bi7dU1Wo1I"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit/537.36 Chrome/120.0.0.0"

PROMPT = (
    "我们来尝试一下，再把这张图详细地拆解并进行切图，以便用于真正的研发落地。"
    "这张图是一个奶茶盲盒抽奖结果页面,你能不能把这张图里涉及到的一些图片元素，"
    "比如说 icon、卡通角色、装饰标签、印章、3D 物体、产品图片，"
    "单独生成纯白色背景的图片(不要透明背景)？元素之间不要重叠,放在白色画布上。"
    "你也可以把同一主题的 icon 放在一张图里面来生成，这样可以提升我们的生成速度和效率。"
)


def main():
    with open(INPUT_IMAGE, "rb") as f:
        img_b64 = base64.b64encode(f.read()).decode()
    print(f"Input image base64: {len(img_b64)} chars")
    print(f"\nPrompt ({len(PROMPT)} chars):\n{PROMPT}\n")

    out_submit = os.path.join(OUT_DIR, "v6-layout-submit.json")
    out_poll = os.path.join(OUT_DIR, "v6-layout-poll.json")
    out_img = os.path.join(OUT_DIR, "v6-layout.png")

    payload = {
        "model": "gpt-image-2",
        "prompt": PROMPT,
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
        sys.exit(1)

    with open(out_submit, "w") as f:
        f.write(submit_raw)
    submit = json.loads(submit_raw)
    if submit.get("code") != 200:
        print(f"submit failed: {submit}")
        sys.exit(1)
    task_id = submit["data"][0]["task_id"]
    print(f"  task_id: {task_id}")

    print("[2/3] Polling...")
    time.sleep(12)
    final = None
    for i in range(40):
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
            sys.exit(1)
        time.sleep(5)

    if not final:
        print("timeout")
        sys.exit(1)

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


if __name__ == "__main__":
    main()
