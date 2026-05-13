#!/usr/bin/env python3
"""切片算法 PoC:对透明 PNG 做 connected component 分析,切出每个元素"""
import sys
import os
import argparse
from PIL import Image
from collections import deque

def slice_assets(input_path: str, output_dir: str,
                 alpha_threshold: int = 32,
                 min_component_size: int = 1000):
    img = Image.open(input_path)
    if 'A' not in img.mode:
        print(f'ERROR: input must be RGBA, got {img.mode}')
        sys.exit(1)
    w, h = img.size
    alpha = img.split()[-1]
    alpha_data = list(alpha.getdata())

    # 构造 mask
    mask = [1 if a > alpha_threshold else 0 for a in alpha_data]
    visited = [False] * (w * h)
    components = []

    print(f'Image: {w}x{h}, alpha threshold > {alpha_threshold}')
    on_pixels = sum(mask)
    print(f'On-pixels (alpha > {alpha_threshold}): {on_pixels} ({on_pixels*100/(w*h):.1f}%)')

    for y in range(h):
        for x in range(w):
            idx = y * w + x
            if mask[idx] == 0 or visited[idx]:
                continue
            # BFS
            queue = deque([(x, y)])
            visited[idx] = True
            x0, y0, x1, y1 = x, y, x, y
            size = 0
            while queue:
                cx, cy = queue.popleft()
                size += 1
                x0 = min(x0, cx); y0 = min(y0, cy)
                x1 = max(x1, cx); y1 = max(y1, cy)
                for nx, ny in [(cx-1,cy),(cx+1,cy),(cx,cy-1),(cx,cy+1)]:
                    if 0 <= nx < w and 0 <= ny < h:
                        nidx = ny * w + nx
                        if mask[nidx] and not visited[nidx]:
                            visited[nidx] = True
                            queue.append((nx, ny))
            components.append({
                'bbox': [x0, y0, x1, y1],
                'size': size,
            })

    # 过滤小块
    big = [c for c in components if c['size'] >= min_component_size]
    print(f'Total components: {len(components)} (after filter ≥ {min_component_size}: {len(big)})')

    # 按 (y_center, x_center) 排序(从上到下,从左到右)
    big.sort(key=lambda c: (
        (c['bbox'][1] + c['bbox'][3]) // 2,
        (c['bbox'][0] + c['bbox'][2]) // 2
    ))

    os.makedirs(output_dir, exist_ok=True)
    for i, c in enumerate(big):
        x0, y0, x1, y1 = c['bbox']
        sliced = img.crop((x0, y0, x1+1, y1+1))
        out_path = os.path.join(output_dir, f'slice-{i:02d}.png')
        sliced.save(out_path)
        print(f'  slice-{i:02d}: bbox=({x0},{y0})-({x1},{y1}) size={c["size"]} → {sliced.size} → {out_path}')

    print(f'\nSaved {len(big)} slices to {output_dir}')

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('input', help='input transparent PNG')
    parser.add_argument('output_dir', help='output dir for slices')
    parser.add_argument('--threshold', type=int, default=32)
    parser.add_argument('--min-size', type=int, default=1000)
    args = parser.parse_args()
    slice_assets(args.input, args.output_dir, args.threshold, args.min_size)
