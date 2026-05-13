#!/usr/bin/env python3
"""v9-A bbox detection: feed each layout image to Gemini, ask for tight bbox per element."""
import base64
import json
import os
import sys
import urllib.request
import time
from PIL import Image, ImageDraw

ROOT = "/Users/lijiakun/Documents/img2UI/poc"
OUT_DIR = os.path.join(ROOT, "outputs")

API_URL = "https://aigc.sankuai.com/v1/openai/native/chat/completions"
API_KEY = "1983731511187542037"

BATCHES = {
    1: {
        "tag": "v9a-batch1",
        "name": "主角色组",
        "elements": [
            {"name": "hero_character_illustration", "desc": "白色云朵头发、穿蓝色羽绒服、棕色靴子的卡通 3D 娃娃"},
            {"name": "main_container_frame", "desc": "粉色异形 3D 展示框，顶部有凹凸城堡边、内部为空腔展示位（即使内部含中文字也只算一个元素）"},
            {"name": "hanging_ring_left", "desc": "左侧 3D 渲染的粉色金属挂钩/环"},
            {"name": "hanging_ring_right", "desc": "右侧 3D 渲染的粉色金属挂钩/环"},
        ],
    },
    2: {
        "tag": "v9a-batch2",
        "name": "装饰标签组",
        "elements": [
            {"name": "super_badge", "desc": "粉色和黄色的「SUPER」倾斜椭圆徽章"},
            {"name": "seal_graphic", "desc": "粉色「解签」毛笔字印章"},
            {"name": "chip_tag_left", "desc": "白底粉色描边的胶囊形 chip 含「黑糖珍珠」"},
            {"name": "chip_tag_top_right", "desc": "白底粉色描边的胶囊形 chip 含「Q弹厚乳」"},
            {"name": "chip_tag_bottom_right", "desc": "白底粉色描边的胶囊形 chip 含「经典奶茶系」"},
        ],
    },
    3: {
        "tag": "v9a-batch3",
        "name": "产品组",
        "elements": [
            {"name": "product_image_1", "desc": "上半部分的奶茶杯产品图（包含奶茶杯主体+围绕的珍珠等装饰元素，但不含旁边的标题/价格/描述文字）"},
            {"name": "product_image_2", "desc": "下半部分的奶茶杯产品图（包含奶茶杯主体+围绕的珍珠等装饰元素，但不含旁边的标题/价格/描述文字）"},
        ],
    },
}

SYSTEM = (
    "You are a layout analyzer. The given image contains several visual elements arranged on a clean white background. "
    "Your job: for EACH element listed by the user, output its tight bounding box in PIXEL coordinates "
    "(x, y, width, height) where (0,0) is the top-left corner of the image.\n\n"
    "Hard rules:\n"
    "- Each visible element gets EXACTLY ONE bbox\n"
    "- bbox MUST tightly fit the element's visible pixels (do NOT include surrounding white margin)\n"
    "- If two elements are close, give them SEPARATE bboxes — DO NOT merge\n"
    "- Use the element 'name' field from the input list as the key in your output\n"
    "- If you cannot find an element, omit it but list it under 'missing'\n\n"
    "Output strict JSON only, no markdown, no prose:\n"
    '{"image_size": [W, H], "elements": [{"name": "<element name>", "bbox": [x, y, w, h]}], "missing": ["..."]}'
)


def gemini_bbox(layout_path: str, elements: list, tag: str):
    img = Image.open(layout_path).convert("RGB")
    W, H = img.size
    with open(layout_path, "rb") as f:
        img_b64 = base64.b64encode(f.read()).decode()

    user_text = (
        f"This layout image is {W}x{H} pixels. It contains {len(elements)} elements. "
        "Identify each one's tight pixel bbox.\n\n"
        "Element list (name -> description):\n"
        + "\n".join(f"- {e['name']}: {e['desc']}" for e in elements)
    )

    payload = {
        "stream": False,
        "model": "gemini-3.1-pro-preview",
        "temperature": 0.2,
        "max_tokens": 4000,
        "response_format": {"type": "json_object"},
        "extra_body": {
            "google": {"thinking_config": {"include_thoughts": False, "thinking_budget": 2048}}
        },
        "messages": [
            {"role": "system", "content": SYSTEM},
            {"role": "user", "content": [
                {"type": "text", "text": user_text},
                {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{img_b64}"}}
            ]}
        ]
    }
    body = json.dumps(payload).encode()
    req = urllib.request.Request(
        API_URL,
        data=body,
        headers={"Authorization": API_KEY, "Content-Type": "application/json"},
        method="POST",
    )
    print(f"  Calling Gemini for {tag} ({W}x{H}, {len(elements)} elements)...")
    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=180) as resp:
            raw = resp.read().decode()
    except urllib.error.HTTPError as e:
        print(f"    HTTP {e.code}: {e.read().decode()[:500]}")
        return None
    print(f"    Done in {time.time()-t0:.1f}s")
    data = json.loads(raw)
    content = data["choices"][0]["message"]["content"]
    parsed = json.loads(content)

    # Save bboxes
    out_json = os.path.join(OUT_DIR, f"{tag}-bboxes.json")
    with open(out_json, "w") as f:
        json.dump({"image_size": [W, H], **parsed}, f, ensure_ascii=False, indent=2)
    print(f"    saved {out_json}")

    # Debug overlay
    debug = img.copy()
    draw = ImageDraw.Draw(debug)
    for i, e in enumerate(parsed.get("elements", [])):
        bbox = e.get("bbox", [])
        if len(bbox) != 4:
            continue
        x, y, w, h = bbox
        draw.rectangle([x, y, x + w - 1, y + h - 1], outline=(255, 0, 0), width=3)
        draw.text((x + 4, y + 4), f"{i}:{e.get('name','')[:14]}", fill=(255, 0, 0))
    debug_path = os.path.join(OUT_DIR, f"{tag}-bboxes-debug.png")
    debug.save(debug_path)
    print(f"    saved {debug_path}")

    return parsed


def main():
    target_batch = None
    if len(sys.argv) > 1:
        target_batch = int(sys.argv[1])
    for batch_id, batch in BATCHES.items():
        if target_batch and batch_id != target_batch:
            continue
        print(f"\n=== Batch {batch_id}: {batch['name']} ===")
        layout = os.path.join(OUT_DIR, f"{batch['tag']}-layout.png")
        if not os.path.exists(layout):
            print(f"  layout not found: {layout}")
            continue
        gemini_bbox(layout, batch["elements"], batch["tag"])


if __name__ == "__main__":
    main()
