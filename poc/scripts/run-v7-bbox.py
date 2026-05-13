#!/usr/bin/env python3
"""v7 Step 5-6: Alpha-based connected component → bbox → crop.
- Foreground = alpha > 32 (no color dependency)
- BFS connected components
- Filter area < 3000
- Pad bbox by 10px
- Crop sub-images (already RGBA, keep alpha)
"""
import json
import os
from collections import deque

import numpy as np
from PIL import Image, ImageDraw

ROOT = "/Users/lijiakun/Documents/img2UI/poc"
LAYOUT = os.path.join(ROOT, "outputs/v7-layout.png")
OUT_DIR = os.path.join(ROOT, "outputs/v7-elements")
DEBUG = os.path.join(ROOT, "outputs/v7-layout-bboxes.png")
BBOX_JSON = os.path.join(ROOT, "outputs/v7-bboxes.json")
ALPHA_THRESH = 32
MIN_AREA = 3000
PAD = 10


def bfs_label(mask):
    h, w = mask.shape
    labels = np.zeros((h, w), dtype=np.int32)
    boxes = {}
    cur = 0
    for y in range(h):
        for x in range(w):
            if mask[y, x] and labels[y, x] == 0:
                cur += 1
                q = deque([(y, x)])
                labels[y, x] = cur
                xmin, ymin, xmax, ymax = x, y, x, y
                area = 0
                while q:
                    yy, xx = q.popleft()
                    area += 1
                    if xx < xmin:
                        xmin = xx
                    if xx > xmax:
                        xmax = xx
                    if yy < ymin:
                        ymin = yy
                    if yy > ymax:
                        ymax = yy
                    for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)):
                        ny, nx = yy + dy, xx + dx
                        if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and labels[ny, nx] == 0:
                            labels[ny, nx] = cur
                            q.append((ny, nx))
                boxes[cur] = (xmin, ymin, xmax, ymax, area)
    return labels, boxes


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    img = Image.open(LAYOUT).convert("RGBA")
    arr = np.array(img)
    h, w = arr.shape[:2]
    alpha = arr[:, :, 3]
    mask = alpha > ALPHA_THRESH
    print(f"layout: {w}x{h}, foreground pixels: {mask.sum()} ({mask.mean()*100:.1f}%)")

    print("BFS labeling (this may take a moment)...")
    labels, boxes = bfs_label(mask)
    print(f"raw components: {len(boxes)}")

    kept = []
    for cid, (x0, y0, x1, y1, area) in boxes.items():
        if area < MIN_AREA:
            continue
        kept.append((x0, y0, x1, y1, area))
    kept.sort(key=lambda b: (b[1], b[0]))
    print(f"after area>={MIN_AREA} filter: {len(kept)}")

    bboxes_out = []
    debug = img.copy()
    draw = ImageDraw.Draw(debug)
    for i, (x0, y0, x1, y1, area) in enumerate(kept):
        px0 = max(0, x0 - PAD)
        py0 = max(0, y0 - PAD)
        px1 = min(w, x1 + PAD + 1)
        py1 = min(h, y1 + PAD + 1)
        bboxes_out.append({
            "index": i,
            "bbox_raw": [int(x0), int(y0), int(x1), int(y1)],
            "bbox_padded": [int(px0), int(py0), int(px1), int(py1)],
            "area": int(area),
        })
        draw.rectangle([px0, py0, px1 - 1, py1 - 1], outline=(255, 0, 0, 255), width=3)
        draw.text((px0 + 4, py0 + 4), str(i), fill=(255, 0, 0, 255))

        sub = img.crop((px0, py0, px1, py1))
        sub.save(os.path.join(OUT_DIR, f"elem-{i:02d}.png"))

    debug.convert("RGB").save(DEBUG)
    with open(BBOX_JSON, "w") as f:
        json.dump({"count": len(bboxes_out), "bboxes": bboxes_out}, f, ensure_ascii=False, indent=2)

    print(f"Wrote {len(bboxes_out)} elem-*.png to {OUT_DIR}")
    print(f"Debug: {DEBUG}")
    print(f"JSON:  {BBOX_JSON}")
    for b in bboxes_out:
        x0, y0, x1, y1 = b["bbox_padded"]
        print(f"  elem-{b['index']:02d}: ({x0},{y0})-({x1},{y1})  size={x1-x0}x{y1-y0}  area={b['area']}")


if __name__ == "__main__":
    main()
