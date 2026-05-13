#!/usr/bin/env python3
"""Run koukoutu background-removal on v4-B-black.png.

We pass the apimart URL directly because it's a public https URL.
"""
import json
import os
import time
import urllib.parse
import urllib.request

ROOT = "/Users/lijiakun/Documents/img2UI/poc"
OUT_DIR = os.path.join(ROOT, "outputs")

KOUKOUTU_KEY = "CoDiyehe0qpQ5AMeQhSKU55A6CnqmLP2"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit/537.36 Chrome/120.0.0.0"

# Read URL from poll JSON
with open(os.path.join(OUT_DIR, "v4-B-black-poll.json")) as f:
    poll = json.load(f)
img_url = poll["data"]["result"]["images"][0]["url"]
if isinstance(img_url, list):
    img_url = img_url[0]
print(f"Source URL: {img_url}")

form = urllib.parse.urlencode({
    "model_key": "background-removal",
    "image_url": img_url,
    "output_format": "png",
}).encode()

print("[1/2] Calling koukoutu /v1/create...")
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
try:
    with urllib.request.urlopen(req, timeout=120) as r:
        body = r.read()
        ctype = r.headers.get("Content-Type", "")
except urllib.error.HTTPError as e:
    print(f"HTTP {e.code}")
    print(e.read().decode())
    raise

print(f"Content-Type: {ctype}, size: {len(body)} bytes")
out_path = os.path.join(OUT_DIR, "v4-keyed.png")

if "image" in ctype or body[:8] == b"\x89PNG\r\n\x1a\n":
    # Sync returns image directly
    with open(out_path, "wb") as f:
        f.write(body)
    print(f"Saved direct image: {out_path} ({len(body)} bytes)")
else:
    text = body.decode()
    print("Response JSON:")
    print(text[:1500])
    data = json.loads(text)
    out_url = None
    for key in ("result_url", "image_url", "url", "output_url"):
        if key in data:
            out_url = data[key]; break
    if not out_url and "data" in data:
        d = data["data"]
        for key in ("result_url", "image_url", "url", "output_url"):
            if key in d:
                out_url = d[key]; break
    if not out_url:
        with open(os.path.join(OUT_DIR, "v4-koukoutu-response.json"), "w") as f:
            f.write(text)
        raise SystemExit(1)
    print(f"[2/2] Downloading from {out_url}...")
    req = urllib.request.Request(out_url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        keyed = r.read()
    with open(out_path, "wb") as f:
        f.write(keyed)
    print(f"Saved: {out_path} ({len(keyed)} bytes)")

from PIL import Image
img = Image.open(out_path)
print(f"Size: {img.size}, Mode: {img.mode}")
