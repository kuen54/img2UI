#!/usr/bin/env python3
"""
Split a transparent-background PNG into individual UI elements.

Usage:
    python split_elements.py <input_image> [--output-dir OUTPUT_DIR] [--padding PADDING] [--min-size MIN_SIZE] [--gap GAP]

Arguments:
    input_image         Path to the input PNG with transparent background
    --output-dir, -o    Output directory (default: <input_name>_elements/)
    --padding, -p       Padding around each element in pixels (default: 5)
    --min-size, -m      Minimum element size in pixels, filters out noise (default: 20)
    --gap, -g           Gap threshold: merge regions closer than this many pixels (default: 5)
"""

import argparse
import os
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage


def split_elements(input_path, output_dir=None, padding=5, min_size=20, gap=5):
    img = Image.open(input_path).convert("RGBA")
    w, h = img.size
    alpha = np.array(img)[:, :, 3]

    # Binary mask: non-transparent pixels
    mask = (alpha > 10).astype(np.uint8)

    # Dilate to bridge small gaps between parts of the same element
    if gap > 0:
        struct = ndimage.generate_binary_structure(2, 2)
        dilated = ndimage.binary_dilation(mask, structure=struct, iterations=gap)
    else:
        dilated = mask

    # Find connected components on the dilated mask
    labeled, num_features = ndimage.label(dilated)

    if output_dir is None:
        stem = Path(input_path).stem
        output_dir = str(Path(input_path).parent / f"{stem}_elements")
    os.makedirs(output_dir, exist_ok=True)

    elements = []
    for i in range(1, num_features + 1):
        ys, xs = np.where(labeled == i)
        y0, y1 = ys.min(), ys.max()
        x0, x1 = xs.min(), xs.max()

        # Filter out tiny noise
        if (y1 - y0) < min_size or (x1 - x0) < min_size:
            continue

        # Add padding
        x0 = max(0, x0 - padding)
        y0 = max(0, y0 - padding)
        x1 = min(w - 1, x1 + padding)
        y1 = min(h - 1, y1 + padding)

        elements.append((x0, y0, x1, y1))

    # Sort: top-to-bottom, then left-to-right
    elements.sort(key=lambda b: (b[1], b[0]))

    for idx, (x0, y0, x1, y1) in enumerate(elements, 1):
        cropped = img.crop((x0, y0, x1 + 1, y1 + 1))
        out_path = os.path.join(output_dir, f"element_{idx:03d}.png")
        cropped.save(out_path)
        print(f"  [{idx}] {out_path}  ({x1 - x0 + 1}x{y1 - y0 + 1})")

    print(f"\nDone: {len(elements)} elements saved to {output_dir}/")
    return elements


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Split transparent PNG into individual elements")
    parser.add_argument("input", help="Input PNG file")
    parser.add_argument("-o", "--output-dir", default=None, help="Output directory")
    parser.add_argument("-p", "--padding", type=int, default=5, help="Padding around elements (default: 5)")
    parser.add_argument("-m", "--min-size", type=int, default=20, help="Minimum element size in px (default: 20)")
    parser.add_argument("-g", "--gap", type=int, default=5, help="Gap bridging iterations (default: 5)")
    args = parser.parse_args()

    split_elements(args.input, args.output_dir, args.padding, args.min_size, args.gap)
