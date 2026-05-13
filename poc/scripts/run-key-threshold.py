#!/usr/bin/env python3
"""Local white-threshold keying — fallback for elements with white-fill (chips)."""
import numpy as np, sys
from PIL import Image, ImageFilter

INPUT = "/Users/lijiakun/Documents/img2UI/poc/outputs/v3-pass2.png"
OUT = "/Users/lijiakun/Documents/img2UI/poc/outputs/v3-keyed-threshold.png"

img = Image.open(INPUT).convert("RGB")
arr = np.array(img)
white = np.array([255, 255, 255])
diff = np.linalg.norm(arr.astype(np.int32) - white, axis=-1)
# < 25 fully transparent, > 60 fully opaque, gradient in between
alpha = np.clip((diff - 25) / 35, 0, 1) * 255
alpha_img = Image.fromarray(alpha.astype(np.uint8)).filter(ImageFilter.SMOOTH)
alpha = np.array(alpha_img)

rgba = np.dstack([arr, alpha])
out = Image.fromarray(rgba.astype(np.uint8), "RGBA")
out.save(OUT)

n = alpha.size
print(f"Saved: {OUT}")
print(f"Size: {out.size}")
print(f"Transparent (<32): {(alpha<32).sum()*100/n:.1f}%")
print(f"Semi (32-224):     {((alpha>=32)&(alpha<224)).sum()*100/n:.1f}%")
print(f"Opaque (>=224):    {(alpha>=224).sum()*100/n:.1f}%")
