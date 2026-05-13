#!/usr/bin/env python3
"""v9-A crop + koukoutu pipeline.

For each batch:
  1. Crop layout per Gemini bbox + 5px padding
  2. Send each crop to koukoutu sync API for background removal
  3. Save RGBA output named after entity_name
"""
import base64
import json
import os
import sys
import time
import urllib.parse
import urllib.request
import urllib.error
from PIL import Image

ROOT = "/Users/lijiakun/Documents/img2UI/poc"
OUT_DIR = os.path.join(ROOT, "outputs")
CROP_DIR = os.path.join(OUT_DIR, "v9a-crops")
ELEM_DIR = os.path.join(OUT_DIR, "v9a-elements")
SUMMARY = os.path.join(OUT_DIR, "v9a-elements-summary.json")

KOUKOUTU_KEY = "CoDiyehe0qpQ5AMeQhSKU55A6CnqmLP2"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit/537.36 Chrome/120.0.0.0"

PAD = 5
BATCHES = [1, 2, 3]


def koukoutu(in_path: str, out_path: str):
    with open(in_path, "rb") as f:
        raw = f.read()
    b64 = base64.b64encode(raw).decode()
    form = urllib.parse.urlencode({
        "model_key": "background-removal",
        "image_url": f"data:image/png;base64,{b64}",
        "output_format": "png",
    }).encode()
    req = urllib.request.Request(
        "https://sync.koukoutu.com/v1/create",
        data=form,
        headers={
            "X-API-Key": KOUKOUTU_KEY,
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": UA,
        },
        method="POST",
    )
    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=240) as r:
            body = r.read()
            ctype = r.headers.get("Content-Type", "")
    except urllib.error.HTTPError as e:
        return {"ok": False, "status": e.code, "error": e.read().decode("utf-8", "replace")[:300]}
    dt = time.time() - t0
    if "image" not in ctype and body[:8] != b"\x89PNG\r\n\x1a\n":
        return {"ok": False, "error": str(body[:200])}
    with open(out_path, "wb") as f:
        f.write(body)
    return {"ok": True, "bytes": len(body), "elapsed_s": round(dt, 2)}


def main():
    os.makedirs(CROP_DIR, exist_ok=True)
    os.makedirs(ELEM_DIR, exist_ok=True)
    summary = {}

    for batch_id in BATCHES:
        layout_path = os.path.join(OUT_DIR, f"v9a-batch{batch_id}-layout.png")
        bbox_path = os.path.join(OUT_DIR, f"v9a-batch{batch_id}-bboxes.json")
        if not (os.path.exists(layout_path) and os.path.exists(bbox_path)):
            print(f"skip batch {batch_id}, missing files")
            continue
        layout = Image.open(layout_path).convert("RGB")
        W, H = layout.size
        with open(bbox_path) as f:
            data = json.load(f)
        elements = data.get("elements", [])
        print(f"\n=== Batch {batch_id}: {len(elements)} elements (layout {W}x{H}) ===")
        for el in elements:
            name = el["name"]
            x, y, w, h = el["bbox"]
            x0 = max(0, x - PAD)
            y0 = max(0, y - PAD)
            x1 = min(W, x + w + PAD)
            y1 = min(H, y + h + PAD)
            crop = layout.crop((x0, y0, x1, y1))
            crop_path = os.path.join(CROP_DIR, f"batch{batch_id}-{name}.png")
            crop.save(crop_path)
            elem_path = os.path.join(ELEM_DIR, f"{name}.png")
            print(f"  {name}: ({x0},{y0})-({x1},{y1}) {crop.size} -> koukoutu", end=" ", flush=True)
            r = koukoutu(crop_path, elem_path)
            summary[name] = {"batch": batch_id, "crop": crop_path, "elem": elem_path, **r}
            if r["ok"]:
                print(f"OK {r['bytes']}B {r['elapsed_s']}s")
            else:
                print(f"FAIL {r}")

    with open(SUMMARY, "w") as f:
        json.dump(summary, f, indent=2, ensure_ascii=False)
    ok = sum(1 for r in summary.values() if r["ok"])
    print(f"\n{ok}/{len(summary)} koukoutu succeeded")
    print(f"crops: {CROP_DIR}")
    print(f"elements: {ELEM_DIR}")


if __name__ == "__main__":
    main()
