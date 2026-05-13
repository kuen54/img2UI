#!/usr/bin/env python3
"""v6 Step 3: Crop each bbox out of v6-layout.png with padding."""
import json
import os

from PIL import Image

ROOT = "/Users/lijiakun/Documents/img2UI/poc"
LAYOUT = os.path.join(ROOT, "outputs/v6-layout.png")
BBOX_JSON = os.path.join(ROOT, "outputs/v6-bboxes.json")
CROP_DIR = os.path.join(ROOT, "outputs/v6-crops")

PAD = 10


def main():
    os.makedirs(CROP_DIR, exist_ok=True)

    with open(BBOX_JSON) as f:
        meta = json.load(f)
    bboxes = meta["bboxes"]
    img = Image.open(LAYOUT).convert("RGB")
    W, H = img.size
    print(f"layout: {W}x{H}, bboxes: {len(bboxes)}")

    for i, (x0, y0, x1, y1) in enumerate(bboxes):
        cx0 = max(0, x0 - PAD)
        cy0 = max(0, y0 - PAD)
        cx1 = min(W, x1 + PAD)
        cy1 = min(H, y1 + PAD)
        sub = img.crop((cx0, cy0, cx1, cy1))
        out = os.path.join(CROP_DIR, f"elem-{i:02d}.png")
        sub.save(out)
        print(f"  elem-{i:02d}: ({cx0},{cy0})-({cx1},{cy1}) {sub.size}  -> {out}")


if __name__ == "__main__":
    main()
