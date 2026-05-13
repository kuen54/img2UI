#!/usr/bin/env python3
"""v6 Step 2: Connected component bbox detection on white-bg layout.

Strategy:
  - load v6-layout.png as RGB
  - foreground = pixels where Euclidean distance from white > threshold
  - BFS connected components (4-neighbour first; fallback to 8-neighbour if too fragmented)
  - filter components by area (>= MIN_AREA)
  - dilate / merge close-by bboxes if their bbox edges overlap or are very close
  - draw red rectangles on a debug image
  - dump bbox list as JSON
"""
import json
import os
import sys
from collections import deque

import numpy as np
from PIL import Image, ImageDraw

ROOT = "/Users/lijiakun/Documents/img2UI/poc"
LAYOUT = os.path.join(ROOT, "outputs/v6-layout.png")
OUT_BBOX_JSON = os.path.join(ROOT, "outputs/v6-bboxes.json")
OUT_DEBUG = os.path.join(ROOT, "outputs/v6-layout-bboxes.png")

# Tunables
WHITE_DIST_THRESHOLD = 30   # pixel is "non-white" / foreground if dist(rgb, white) > threshold
MIN_AREA = 1500             # drop tiny specks
MERGE_PADDING = 8           # if two bboxes are within this many px, merge them


def find_components(fg_mask: np.ndarray):
    """Iterative BFS over fg_mask. Returns list of (x0, y0, x1, y1, area)."""
    h, w = fg_mask.shape
    visited = np.zeros_like(fg_mask, dtype=bool)
    components = []
    # 8-neighbour connectivity
    NEIGH = [(-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1)]
    for sy in range(h):
        for sx in range(w):
            if not fg_mask[sy, sx] or visited[sy, sx]:
                continue
            # BFS
            q = deque()
            q.append((sy, sx))
            visited[sy, sx] = True
            x0, y0, x1, y1 = sx, sy, sx, sy
            area = 0
            while q:
                cy, cx = q.popleft()
                area += 1
                if cx < x0:
                    x0 = cx
                if cx > x1:
                    x1 = cx
                if cy < y0:
                    y0 = cy
                if cy > y1:
                    y1 = cy
                for dy, dx in NEIGH:
                    ny, nx = cy + dy, cx + dx
                    if 0 <= ny < h and 0 <= nx < w and fg_mask[ny, nx] and not visited[ny, nx]:
                        visited[ny, nx] = True
                        q.append((ny, nx))
            components.append((x0, y0, x1 + 1, y1 + 1, area))
    return components


def merge_bboxes(bboxes, pad):
    """Merge bboxes whose padded rectangles overlap. Iterates until stable."""
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
            ax0, ay0, ax1, ay1 = x0 - pad, y0 - pad, x1 + pad, y1 + pad
            merged_any = False
            for j in range(i + 1, len(boxes)):
                if used[j]:
                    continue
                bx0, by0, bx1, by1 = boxes[j][:4]
                bax0, bay0, bax1, bay1 = bx0 - pad, by0 - pad, bx1 + pad, by1 + pad
                # check rectangle overlap
                if ax0 < bax1 and bax0 < ax1 and ay0 < bay1 and bay0 < ay1:
                    # merge
                    x0 = min(x0, bx0)
                    y0 = min(y0, by0)
                    x1 = max(x1, bx1)
                    y1 = max(y1, by1)
                    ax0, ay0, ax1, ay1 = x0 - pad, y0 - pad, x1 + pad, y1 + pad
                    used[j] = True
                    merged_any = True
                    changed = True
            used[i] = True
            out.append([x0, y0, x1, y1])
        boxes = out
    return [tuple(b) for b in boxes]


def main():
    img = Image.open(LAYOUT).convert("RGB")
    arr = np.array(img)
    h, w = arr.shape[:2]
    print(f"layout: {w}x{h}")

    diff = np.linalg.norm(arr.astype(np.int32) - np.array([255, 255, 255]), axis=-1)
    fg_mask = diff > WHITE_DIST_THRESHOLD
    fg_count = int(fg_mask.sum())
    print(f"foreground pixels: {fg_count} ({fg_count*100.0/(h*w):.1f}%)")

    print("running BFS connected components...")
    comps = find_components(fg_mask)
    print(f"raw components: {len(comps)}")

    big = [(x0, y0, x1, y1, area) for (x0, y0, x1, y1, area) in comps if area >= MIN_AREA]
    big.sort(key=lambda b: -b[4])
    print(f"after MIN_AREA={MIN_AREA}: {len(big)} components")
    for i, (x0, y0, x1, y1, a) in enumerate(big[:30]):
        print(f"  #{i:02d}  bbox=({x0},{y0})-({x1},{y1})  size={x1-x0}x{y1-y0}  area={a}")

    raw_boxes = [(x0, y0, x1, y1) for (x0, y0, x1, y1, _) in big]

    merged = merge_bboxes(raw_boxes, MERGE_PADDING)
    # sort by reading order: top-to-bottom, left-to-right
    merged.sort(key=lambda b: (b[1] // 30, b[0]))
    print(f"\nafter merge (pad={MERGE_PADDING}): {len(merged)} bboxes")
    for i, (x0, y0, x1, y1) in enumerate(merged):
        print(f"  #{i:02d}  bbox=({x0},{y0})-({x1},{y1})  size={x1-x0}x{y1-y0}")

    # write JSON
    with open(OUT_BBOX_JSON, "w") as f:
        json.dump(
            {
                "layout": LAYOUT,
                "image_size": [w, h],
                "bboxes": [list(b) for b in merged],
                "white_dist_threshold": WHITE_DIST_THRESHOLD,
                "min_area": MIN_AREA,
                "merge_padding": MERGE_PADDING,
            },
            f,
            indent=2,
        )
    print(f"wrote {OUT_BBOX_JSON}")

    # debug image: draw red rectangles
    debug = img.copy()
    draw = ImageDraw.Draw(debug)
    for i, (x0, y0, x1, y1) in enumerate(merged):
        draw.rectangle([x0, y0, x1 - 1, y1 - 1], outline=(255, 0, 0), width=3)
        draw.text((x0 + 4, y0 + 4), str(i), fill=(255, 0, 0))
    debug.save(OUT_DEBUG)
    print(f"wrote {OUT_DEBUG}")


if __name__ == "__main__":
    main()
