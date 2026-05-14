#!/usr/bin/env python3
"""PoC #1: image-edit 多参考图行为验证

目的:验证 apimart gpt-image-2-official 拿到 image_urls=[原图, crop1..n] 时
- A 路(baseline): 仅原图 + 文字描述,等价 v11 1-shot
- B 路(多参考):  原图 + 5 张 crop + prompt 编号引用

对比目标:5 个 batch2 装饰元素(3 chip + super + seal)
- 5 个元素是否都画到
- 文字内容是否准确(chip 上「黑糖珍珠」「Q弹厚乳」「经典奶茶系」)
- 风格 / 颜色 / 形状是否跟参考图匹配
- 是否触发 regenerate(产物风格明显偏离参考图)

通过标准:B 路明显优于 A 路或不差于 A 路。失败标准:B 路漏画/字串/风格漂移更严重

输出:poc/v12-multi-route/outputs/poc1-{A,B}-{submit,poll}.json + poc1-{A,B}.png
"""
import base64
import json
import os
import sys
import time
import urllib.request
import urllib.error

ROOT = "/Users/lijiakun/Documents/img2UI/poc"
INPUT_IMAGE = os.path.join(ROOT, "inputs/canonical-1024.png")
CROPS_DIR = os.path.join(ROOT, "outputs/v9a-crops")
OUT_DIR = os.path.join(ROOT, "v12-multi-route/outputs")
os.makedirs(OUT_DIR, exist_ok=True)

API_BASE = "https://api.apimart.ai/v1"
API_KEY = "sk-SNsVuJCDEBDKIkcnEMu7S78dqvpYKoc6RG8mX6bi7dU1Wo1I"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit/537.36 Chrome/120.0.0.0"

# 5 个 batch2 装饰元素(类比 visual_category=decoration)
ELEMENTS = [
    {
        "key": "chip_left",
        "crop": "batch2-chip_tag_left.png",
        "name": "「黑糖珍珠」奶茶 chip",
        "desc": "白底粉色描边的胶囊形 chip,带小奶茶杯图标和「黑糖珍珠」中文字",
    },
    {
        "key": "chip_top_right",
        "crop": "batch2-chip_tag_top_right.png",
        "name": "「Q弹厚乳」奶茶 chip",
        "desc": "白底粉色描边的胶囊形 chip,带小奶茶杯图标和「Q弹厚乳」中文字",
    },
    {
        "key": "chip_bottom_right",
        "crop": "batch2-chip_tag_bottom_right.png",
        "name": "「经典奶茶系」奶茶 chip",
        "desc": "白底粉色描边的胶囊形 chip,带小奶茶杯图标和「经典奶茶系」中文字",
    },
    {
        "key": "super_badge",
        "crop": "batch2-super_badge.png",
        "name": "SUPER 装饰徽章",
        "desc": "粉色和黄色的「SUPER」倾斜椭圆徽章,带虚线轮廓和星星装饰",
    },
    {
        "key": "seal",
        "crop": "batch2-seal_graphic.png",
        "name": "「解签」毛笔字印章",
        "desc": "粉色「解签」毛笔字印章,带星星装饰",
    },
]

PROMPT_A = """我们来尝试一下,把这张图(奶茶盲盒抽奖结果页)里的装饰类元素提取出来,单独放在一张鲜亮的纯绿色 #00FF00 背景画布上,作为后期抠像的绿幕。元素本身不要使用这个绿色。

画布上要出现这些元素,一个都不能少:
- 「黑糖珍珠」奶茶 chip(白底粉色描边胶囊形,带小奶茶杯图标)
- 「Q弹厚乳」奶茶 chip(白底粉色描边胶囊形,带小奶茶杯图标)
- 「经典奶茶系」奶茶 chip(白底粉色描边胶囊形,带小奶茶杯图标)
- SUPER 装饰徽章(粉黄椭圆+虚线+星星)
- 「解签」毛笔字印章(粉色,带星星装饰)

共 5 个元素,记得每个都画到。元素之间留出至少一整个元素宽度的空隙,宁可画布留白多也不要挤在一起。保持原图的风格、颜色、文字内容,不要重新设计任何元素,每个都要跟原图里完全一致。"""

PROMPT_B = """我们来尝试一下,把这张图(奶茶盲盒抽奖结果页)里的装饰类元素提取出来,单独放在一张鲜亮的纯绿色 #00FF00 背景画布上,作为后期抠像的绿幕。元素本身不要使用这个绿色。

第 1 张参考图是原图,展示了这些元素在画面里的整体样貌。后面的参考图是从原图取出的每个元素的特写,要画的就是这些:

- 参考图 #2:「黑糖珍珠」奶茶 chip(白底粉色描边胶囊形,带小奶茶杯图标)
- 参考图 #3:「Q弹厚乳」奶茶 chip(白底粉色描边胶囊形,带小奶茶杯图标)
- 参考图 #4:「经典奶茶系」奶茶 chip(白底粉色描边胶囊形,带小奶茶杯图标)
- 参考图 #5:SUPER 装饰徽章(粉黄椭圆+虚线+星星)
- 参考图 #6:「解签」毛笔字印章(粉色,带星星装饰)

共 5 个元素,记得每个都画到。元素之间留出至少一整个元素宽度的空隙,宁可画布留白多也不要挤在一起。每个元素都要跟参考图里完全一致——保持原图的风格、颜色、文字内容,不要重新设计任何元素。"""


def load_b64(path: str) -> str:
    with open(path, "rb") as f:
        return base64.b64encode(f.read()).decode()


def submit_and_poll(prompt: str, image_urls: list, tag: str):
    out_submit = os.path.join(OUT_DIR, f"{tag}-submit.json")
    out_poll = os.path.join(OUT_DIR, f"{tag}-poll.json")
    out_img = os.path.join(OUT_DIR, f"{tag}.png")

    payload = {
        "model": "gpt-image-2-official",
        "prompt": prompt,
        "image_urls": image_urls,
        "size": "1:1",
        "resolution": "1k",
        "quality": "high",
        "n": 1,
    }
    body = json.dumps(payload).encode()

    print(f"  Submitting {tag} ({len(image_urls)} ref images, prompt {len(prompt)} chars)...")
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
        with urllib.request.urlopen(req, timeout=60) as r:
            submit_raw = r.read().decode()
    except urllib.error.HTTPError as e:
        print(f"    HTTP {e.code}: {e.read().decode()[:500]}")
        return None

    with open(out_submit, "w") as f:
        f.write(submit_raw)
    submit = json.loads(submit_raw)
    if submit.get("code") != 200:
        print(f"    submit failed: {submit}")
        return None
    task_id = submit["data"][0]["task_id"]
    print(f"    task_id: {task_id}")

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
            print(f"    poll error: {e}")
            time.sleep(6)
            continue
        poll = json.loads(poll_raw)
        status = poll.get("data", {}).get("status", "unknown")
        print(f"    poll #{i + 1} ({elapsed}s) status={status}")
        if status in ("completed", "succeeded", "success"):
            final = poll
            break
        if status in ("failed", "error"):
            print(json.dumps(poll, ensure_ascii=False)[:2000])
            return None
        time.sleep(6)

    if not final:
        print("    timeout")
        return None

    with open(out_poll, "w") as f:
        json.dump(final, f, ensure_ascii=False, indent=2)

    images = final["data"]["result"]["images"]
    img_obj = images[0]
    url = img_obj.get("url")
    if isinstance(url, list):
        url = url[0]

    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=90) as r:
        data = r.read()
    with open(out_img, "wb") as f:
        f.write(data)
    print(f"    Saved: {out_img} ({len(data)} bytes)")
    cost = final.get("data", {}).get("cost")
    actual_time = final.get("data", {}).get("actual_time")
    print(f"    cost={cost}, actual_time={actual_time}s")
    return out_img


def main():
    target = None
    if len(sys.argv) > 1:
        target = sys.argv[1].upper()  # "A" / "B"

    raw_b64 = load_b64(INPUT_IMAGE)
    raw_url = f"data:image/png;base64,{raw_b64}"

    if target in (None, "A"):
        print("=== Run A (baseline: only canonical) ===")
        result_a = submit_and_poll(PROMPT_A, [raw_url], "poc1-A")
        if not result_a:
            print("  FAILED A")

    if target in (None, "B"):
        print("\n=== Run B (multi-ref: canonical + 5 element crops) ===")
        crop_urls = []
        for el in ELEMENTS:
            crop_path = os.path.join(CROPS_DIR, el["crop"])
            crop_b64 = load_b64(crop_path)
            crop_urls.append(f"data:image/png;base64,{crop_b64}")
        result_b = submit_and_poll(PROMPT_B, [raw_url] + crop_urls, "poc1-B")
        if not result_b:
            print("  FAILED B")


if __name__ == "__main__":
    main()
