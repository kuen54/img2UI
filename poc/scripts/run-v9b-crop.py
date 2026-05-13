#!/usr/bin/env python3
"""Path B Step 2: crop static elements directly from original image using normalized bbox."""
import json, os, sys
from PIL import Image

ROOT = "/Users/lijiakun/Documents/img2UI/poc"
# Use higher-resolution source for sharper crops; bbox is normalized so it works on any size
ORIG = os.path.join(ROOT, "inputs/canonical-1024.png")
PASS1 = os.path.join(ROOT, "outputs/v9b-pass1.json")
OUT_DIR = os.path.join(ROOT, "outputs/v9b-crops")
os.makedirs(OUT_DIR, exist_ok=True)

PAD = 0.08  # 8% padding

orig = Image.open(ORIG).convert("RGB")
W, H = orig.size
print(f"Original size: {W}x{H}")

with open(PASS1) as f:
    data = json.load(f)

statics = [e for e in data["elements"] if e.get("type") == "static"]
print(f"Static elements: {len(statics)}")

manifest = []
for elem in statics:
    name = elem["entity_name"]
    bbox = elem["bbox"]  # [x, y, w, h] normalized 0-1
    x = bbox[0] * W
    y = bbox[1] * H
    w = bbox[2] * W
    h = bbox[3] * H
    pad_w = w * PAD
    pad_h = h * PAD
    x0 = max(0, int(x - pad_w))
    y0 = max(0, int(y - pad_h))
    x1 = min(W, int(x + w + pad_w))
    y1 = min(H, int(y + h + pad_h))
    sub = orig.crop((x0, y0, x1, y1))
    out_path = os.path.join(OUT_DIR, f"{name}.png")
    sub.save(out_path)
    print(f"  {name}: bbox=({bbox[0]:.3f},{bbox[1]:.3f},{bbox[2]:.3f},{bbox[3]:.3f}) -> crop ({x0},{y0},{x1},{y1}) size={sub.size}")
    manifest.append({
        "entity_name": name,
        "bbox_norm": bbox,
        "crop_pixel": [x0, y0, x1, y1],
        "crop_size": sub.size,
        "path": out_path,
    })

with open(os.path.join(OUT_DIR, "_manifest.json"), "w") as f:
    json.dump({"orig_size": [W, H], "pad": PAD, "items": manifest}, f, ensure_ascii=False, indent=2)

print(f"\nSaved {len(manifest)} crops to {OUT_DIR}")
