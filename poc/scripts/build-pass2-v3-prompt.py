#!/usr/bin/env python3
"""Build Pass 2 v3 prompt from Pass 1 v3 output.

Key principles (per user 2026-05-13):
- Pure natural-language description-driven
- DO NOT mention entity_name / bbox / JSON / type / coordinates / fields
- Each element is a single prose paragraph from Pass 1's `description` field
- Pass 2 prompt = setup + numbered list of descriptions + output rules
"""
import json, os

ROOT = "/Users/lijiakun/Documents/img2UI/poc"
PASS1_PATH = os.path.join(ROOT, "outputs/v3-pass1-parsed.json")
OUT_PROMPT = os.path.join(ROOT, "prompts/pass2-v3.txt")

with open(PASS1_PATH) as f:
    parsed = json.load(f)

elements = parsed["elements"]
static_elements = [e for e in elements if e.get("type") == "static"]
print(f"Total elements: {len(elements)}, static: {len(static_elements)}")

# Build prompt
header = """You are given a source design image (a Chinese mobile app page, a milk tea blind-box result page). Your task: find specific decorative elements in this image and arrange them on a clean white background, separated and not overlapping.

Look at the source image carefully. For each element described below, find it in the source and copy it onto the white canvas — preserve its EXACT shape, colors, lighting, 3D rendering, and ALL text content (Chinese and English) as drawn in the source.

Elements to find and extract:
"""

# numbered list of descriptions only — no entity_name, no field names, no bbox
items = []
for i, e in enumerate(static_elements, 1):
    desc = e["description"].strip()
    items.append(f"{i}. {desc}")

footer = """

Output rules:
- Use a clean white (#FFFFFF) background.
- Place elements clearly separated on the canvas, with comfortable spacing between them. NO overlap.
- Preserve every Chinese character EXACTLY as drawn in the source — do not substitute, do not romanize, do not drop, do not change the font style.
- Preserve original colors, gradients, and visual style — these elements are stylized graphics, do not flatten or simplify them.
- Do NOT include the source image's status bar, navigation buttons, title text, body text, product cards, prices, descriptive paragraphs, or any element not listed above.
- Do NOT add new shadows underneath elements. Only preserve shadows that are part of the element itself in the source.
- Do NOT add labels, captions, frames, or any text that is not already on an element.
"""

prompt = header + "\n" + "\n".join(items) + footer

with open(OUT_PROMPT, "w") as f:
    f.write(prompt)

print(f"Saved prompt: {OUT_PROMPT} ({len(prompt)} chars, {len(items)} elements)")
print("\n=== PREVIEW ===")
print(prompt[:2500])
print("...")
print(prompt[-800:])
