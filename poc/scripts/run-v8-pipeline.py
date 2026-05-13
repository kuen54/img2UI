#!/usr/bin/env python3
"""v8 end-to-end pipeline v2 (correct order).

White-bg layout has white-cored chips/badges that koukoutu strips when applied
to whole image. So:

  1. Bbox detection on RGB white-bg layout (non-white threshold), like v6 did.
  2. Crop each bbox out of layout (v8-crops/, RGB).
  3. Koukoutu per crop -> v8-elements/ (RGBA).
"""
import base64
import json
import os
import sys
import time
import urllib.parse
import urllib.request
import urllib.error
from collections import deque

import numpy as np
from PIL import Image, ImageDraw

ROOT = "/Users/lijiakun/Documents/img2UI/poc"
LAYOUT = os.path.join(ROOT, "outputs/v8-B-official-white.png")
BBOX_JSON = os.path.join(ROOT, "outputs/v8-bboxes.json")
DEBUG_BBOX = os.path.join(ROOT, "outputs/v8-bboxes-debug.png")
CROP_DIR = os.path.join(ROOT, "outputs/v8-crops")
ELEM_DIR = os.path.join(ROOT, "outputs/v8-elements")
SUMMARY = os.path.join(ROOT, "outputs/v8-elements-summary.json")

KOUKOUTU_KEY = "CoDiyehe0qpQ5AMeQhSKU55A6CnqmLP2"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit/537.36 Chrome/120.0.0.0"

WHITE_DIST_THRESHOLD = 30
MIN_AREA = 1500
MERGE_PADDING = 12
PAD = 10


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
        return {"ok": False, "error": body[:200]}
    with open(out_path, "wb") as f:
        f.write(body)
    return {"ok": True, "bytes": len(body), "elapsed_s": round(dt, 2)}


def find_components(fg_mask: np.ndarray):
    h, w = fg_mask.shape
    visited = np.zeros_like(fg_mask, dtype=bool)
    components = []
    NEIGH = [(-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1)]
    for sy in range(h):
        for sx in range(w):
            if not fg_mask[sy, sx] or visited[sy, sx]:
                continue
            q = deque()
            q.append((sy, sx))
            visited[sy, sx] = True
            x0, y0, x1, y1 = sx, sy, sx, sy
            area = 0
            while q:
                cy, cx = q.popleft()
                area += 1
                if cx < x0: x0 = cx
                if cx > x1: x1 = cx
                if cy < y0: y0 = cy
                if cy > y1: y1 = cy
                for dy, dx in NEIGH:
                    ny, nx = cy + dy, cx + dx
                    if 0 <= ny < h and 0 <= nx < w and fg_mask[ny, nx] and not visited[ny, nx]:
                        visited[ny, nx] = True
                        q.append((ny, nx))
            components.append((x0, y0, x1 + 1, y1 + 1, area))
    return components


def merge_bboxes(bboxes, pad):
    boxes = [list(b) for b in bboxes]
    changed = True
    while changed:
        changed = False
        out = []
        used = [False] * len(boxes)
        for i in range(len(boxes)):
            if used[i]:
                continue
            x0, y0, x1, y1 = boxes[i][:4]
            for j in range(i + 1, len(boxes)):
                if used[j]:
                    continue
                bx0, by0, bx1, by1 = boxes[j][:4]
                ax0, ay0, ax1, ay1 = x0 - pad, y0 - pad, x1 + pad, y1 + pad
                bax0, bay0, bax1, bay1 = bx0 - pad, by0 - pad, bx1 + pad, by1 + pad
                if ax0 < bax1 and bax0 < ax1 and ay0 < bay1 and bay0 < ay1:
                    x0 = min(x0, bx0); y0 = min(y0, by0)
                    x1 = max(x1, bx1); y1 = max(y1, by1)
                    used[j] = True
                    changed = True
            used[i] = True
            out.append([x0, y0, x1, y1])
        boxes = out
    return [tuple(b) for b in boxes]


def main():
    print("[1/3] white-bg bbox detection...")
    img = Image.open(LAYOUT).convert("RGB")
    arr = np.array(img)
    h, w = arr.shape[:2]
    diff = np.linalg.norm(arr.astype(np.int32) - np.array([255, 255, 255]), axis=-1)
    fg_mask = diff > WHITE_DIST_THRESHOLD
    fg = int(fg_mask.sum())
    print(f"  layout: {w}x{h}, fg(non-white): {fg} ({fg*100.0/(h*w):.1f}%)")

    comps = find_components(fg_mask)
    big = [(x0, y0, x1, y1, area) for (x0, y0, x1, y1, area) in comps if area >= MIN_AREA]
    big.sort(key=lambda b: -b[4])
    print(f"  raw components: {len(comps)}, kept: {len(big)}")
    raw_boxes = [(x0, y0, x1, y1) for (x0, y0, x1, y1, _) in big]
    merged = merge_bboxes(raw_boxes, MERGE_PADDING)
    merged.sort(key=lambda b: (b[1] // 30, b[0]))
    print(f"  merged: {len(merged)} bboxes")
    for i, (x0, y0, x1, y1) in enumerate(merged):
        print(f"    #{i:02d} ({x0},{y0})-({x1},{y1}) size={x1-x0}x{y1-y0}")

    with open(BBOX_JSON, "w") as f:
        json.dump({
            "layout": LAYOUT,
            "image_size": [w, h],
            "bboxes": [list(b) for b in merged],
            "white_dist_threshold": WHITE_DIST_THRESHOLD,
            "min_area": MIN_AREA,
            "merge_padding": MERGE_PADDING,
        }, f, indent=2)

    debug = img.copy()
    draw = ImageDraw.Draw(debug)
    for i, (x0, y0, x1, y1) in enumerate(merged):
        draw.rectangle([x0, y0, x1 - 1, y1 - 1], outline=(255, 0, 0), width=3)
        draw.text((x0 + 4, y0 + 4), str(i), fill=(255, 0, 0))
    debug.save(DEBUG_BBOX)
    print(f"  wrote {DEBUG_BBOX}")

    print("[2/3] cropping...")
    os.makedirs(CROP_DIR, exist_ok=True)
    for i, (x0, y0, x1, y1) in enumerate(merged):
        cx0 = max(0, x0 - PAD); cy0 = max(0, y0 - PAD)
        cx1 = min(w, x1 + PAD); cy1 = min(h, y1 + PAD)
        sub = img.crop((cx0, cy0, cx1, cy1))
        out = os.path.join(CROP_DIR, f"elem-{i:02d}.png")
        sub.save(out)
        print(f"    elem-{i:02d}: ({cx0},{cy0})-({cx1},{cy1}) {sub.size}")

    print("[3/3] koukoutu per crop -> RGBA elements...")
    os.makedirs(ELEM_DIR, exist_ok=True)
    crops = sorted(f for f in os.listdir(CROP_DIR) if f.endswith(".png"))
    results = {}
    for name in crops:
        cp = os.path.join(CROP_DIR, name)
        outp = os.path.join(ELEM_DIR, name)
        print(f"  -> {name}", end=" ", flush=True)
        r = koukoutu(cp, outp)
        results[name] = r
        if r["ok"]:
            print(f"OK {r['bytes']}B {r['elapsed_s']}s")
        else:
            print(f"FAIL {r}")
    with open(SUMMARY, "w") as f:
        json.dump(results, f, indent=2, ensure_ascii=False)
    ok = sum(1 for r in results.values() if r["ok"])
    print(f"\n{ok}/{len(results)} koukoutu succeeded")
    print(f"elements: {ELEM_DIR}")


if __name__ == "__main__":
    main()
