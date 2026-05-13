#!/usr/bin/env python3
"""v8-A: gpt-image-2-official + quality=high + transparent prompt (v7 case)."""
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
    "这张图是一个奶茶盲盒抽奖结果页面，主要包含以下装饰性图片元素：\n\n"
    "- 一个白色云朵头发、穿蓝色羽绒服、棕色靴子的卡通 3D 娃娃\n"
    "- 一个粉色和黄色的「SUPER」倾斜椭圆徽章，带虚线轮廓和星星装饰\n"
    "- 一个粉色「解签」毛笔字印章\n"
    "- 一个白底粉色描边的胶囊形 chip，带小奶茶杯图标和「黑糖珍珠」中文字\n"
    "- 一个白底粉色描边的胶囊形 chip，带小奶茶杯图标和「Q弹厚乳」中文字\n"
    "- 一个白底粉色描边的胶囊形 chip，带小奶茶杯图标和「经典奶茶系」中文字\n"
    "- 一个 3D 渲染的奶茶杯，透明杯身、棕色珍珠、白色奶盖花纹\n"
    "- 一对粉色金属挂钩（用于连接上下两个容器）\n"
    "- 一个粉色异形 3D 展示框，顶部有凹凸边、内部为空腔展示位\n\n"
    "请你把这些元素从这张图里提取出来，单独生成完全透明背景的 PNG 图片，"
    "元素之间不要重叠，放在画布上互不干扰。"
    "同主题的 icon 可以放在一张图里来生成，以提升效率。"
)

OUT_TAG = "v8-A-official-transparent"


def main():
    with open(INPUT_IMAGE, "rb") as f:
        img_b64 = base64.b64encode(f.read()).decode()
    print(f"Input image base64: {len(img_b64)} chars")
    print(f"\nPrompt ({len(PROMPT)} chars)")

    out_submit = os.path.join(OUT_DIR, f"{OUT_TAG}-submit.json")
    out_poll = os.path.join(OUT_DIR, f"{OUT_TAG}-poll.json")
    out_img = os.path.join(OUT_DIR, f"{OUT_TAG}.png")

    payload = {
        "model": "gpt-image-2-official",
        "prompt": PROMPT,
        "image_urls": [f"data:image/png;base64,{img_b64}"],
        "size": "1:1",
        "resolution": "1k",
        "quality": "high",
        "n": 1,
    }
    body = json.dumps(payload).encode()

    print("[1/3] Submitting (official, transparent, quality=high)...")
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
    time.sleep(15)
    final = None
    for i in range(60):
        elapsed = 15 + i * 6
        req = urllib.request.Request(
            f"{API_BASE}/tasks/{task_id}",
            headers={
                "Authorization": f"Bearer {API_KEY}",
                "User-Agent": UA,
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=20) as r:
                poll_raw = r.read().decode()
        except Exception as e:
            print(f"   poll error: {e}")
            time.sleep(6)
            continue
        poll = json.loads(poll_raw)
        status = poll.get("data", {}).get("status", "unknown")
        print(f"  poll #{i+1} ({elapsed}s) status={status}")
        if status in ("completed", "succeeded", "success"):
            final = poll
            break
        if status in ("failed", "error"):
            print(json.dumps(poll, ensure_ascii=False)[:2000])
            sys.exit(1)
        time.sleep(6)

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
    with urllib.request.urlopen(req, timeout=90) as r:
        data = r.read()
    with open(out_img, "wb") as f:
        f.write(data)
    print(f"  Saved: {out_img} ({len(data)} bytes)")

    try:
        from PIL import Image
        import numpy as np
        im = Image.open(out_img)
        print(f"  mode={im.mode} size={im.size}")
        if im.mode == "RGBA":
            arr = np.array(im)
            alpha = arr[:, :, 3]
            transparent = (alpha < 32).sum()
            total = alpha.size
            print(f"  transparent ratio: {transparent/total:.2%}")
    except Exception as e:
        print(f"  alpha check skipped: {e}")


if __name__ == "__main__":
    main()
