#!/usr/bin/env python3
"""v9-A Pass 2: 3 batches of element extraction (gpt-image-2-official, quality=high, white-bg).

Batch 1 (主角色组): hero character + 异形展示框 + 2 hanging rings
Batch 2 (装饰标签组): SUPER + 解签 + 3 chip tags
Batch 3 (产品组): 2 product images
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

PROMPT_TPL = (
    "我们来尝试一下，再把这张图详细地拆解。这张图是奶茶盲盒抽奖结果页面，请聚焦于以下这一组元素：\n\n"
    "{element_list}\n\n"
    "把这些元素从原图里提取出来，单独生成纯白色背景的 PNG，元素之间留出明显的空隙（至少 50 像素），不要重叠。"
    "保持原图的视觉风格、光影、文字内容不变。"
)

BATCHES = {
    1: {
        "tag": "v9a-batch1-layout",
        "name": "主角色组",
        "elements": [
            {"name": "hero_character_illustration", "desc": "白色云朵头发、穿蓝色羽绒服、棕色靴子的卡通 3D 娃娃（不要后面的粉色光环背景，只要娃娃）"},
            {"name": "main_container_frame", "desc": "粉色异形 3D 展示框，顶部有凹凸城堡边、内部为空腔展示位（不带任何内部内容，只要外框本身）"},
            {"name": "hanging_ring_left", "desc": "左侧 3D 渲染的粉色金属挂钩/环（连接上下两个容器用）"},
            {"name": "hanging_ring_right", "desc": "右侧 3D 渲染的粉色金属挂钩/环（连接上下两个容器用）"},
        ],
    },
    2: {
        "tag": "v9a-batch2-layout",
        "name": "装饰标签组",
        "elements": [
            {"name": "super_badge", "desc": "粉色和黄色的「SUPER」倾斜椭圆徽章，带虚线轮廓和星星装饰"},
            {"name": "seal_graphic", "desc": "粉色「解签」毛笔字印章，带星星装饰"},
            {"name": "chip_tag_left", "desc": "白底粉色描边的胶囊形 chip，带小奶茶杯图标和「黑糖珍珠」中文字"},
            {"name": "chip_tag_top_right", "desc": "白底粉色描边的胶囊形 chip，带小奶茶杯图标和「Q弹厚乳」中文字"},
            {"name": "chip_tag_bottom_right", "desc": "白底粉色描边的胶囊形 chip，带小奶茶杯图标和「经典奶茶系」中文字"},
        ],
    },
    3: {
        "tag": "v9a-batch3-layout",
        "name": "产品组",
        "elements": [
            {"name": "product_image_1", "desc": "第一杯奶茶产品图：奶茶杯+黑糖珍珠（深色碗里装着的珍珠），整体方形构图"},
            {"name": "product_image_2", "desc": "第二杯奶茶产品图：奶茶杯+黑糖珍珠+脆啵啵（深色碗里装着的珍珠和脆啵啵），整体方形构图"},
        ],
    },
}


def submit_and_poll(prompt: str, img_b64: str, tag: str):
    out_submit = os.path.join(OUT_DIR, f"{tag}-submit.json")
    out_poll = os.path.join(OUT_DIR, f"{tag}-poll.json")
    out_img = os.path.join(OUT_DIR, f"{tag}.png")

    payload = {
        "model": "gpt-image-2-official",
        "prompt": prompt,
        "image_urls": [f"data:image/png;base64,{img_b64}"],
        "size": "1:1",
        "resolution": "1k",
        "quality": "high",
        "n": 1,
    }
    body = json.dumps(payload).encode()

    print(f"  Submitting {tag}...")
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
        print(f"    HTTP {e.code}: {e.read().decode()}")
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
        print(f"    poll #{i+1} ({elapsed}s) status={status}")
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
    return out_img


def main():
    target_batch = None
    if len(sys.argv) > 1:
        target_batch = int(sys.argv[1])

    with open(INPUT_IMAGE, "rb") as f:
        img_b64 = base64.b64encode(f.read()).decode()

    for batch_id, batch in BATCHES.items():
        if target_batch and batch_id != target_batch:
            continue
        print(f"\n=== Batch {batch_id}: {batch['name']} ({len(batch['elements'])} elements) ===")
        elem_list = "\n".join(f"- {e['desc']}" for e in batch["elements"])
        prompt = PROMPT_TPL.format(element_list=elem_list)
        print(f"Prompt ({len(prompt)} chars):")
        print(prompt[:400] + "..." if len(prompt) > 400 else prompt)

        result = submit_and_poll(prompt, img_b64, batch["tag"])
        if not result:
            print(f"  FAILED batch {batch_id}")
            continue


if __name__ == "__main__":
    main()
