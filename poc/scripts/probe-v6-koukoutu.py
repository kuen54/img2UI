#!/usr/bin/env python3
"""v6 Step 4 probe: try koukoutu sync endpoint with a base64 data URI."""
import base64
import os
import sys
import urllib.parse
import urllib.request
import urllib.error

ROOT = "/Users/lijiakun/Documents/img2UI/poc"
CROP = os.path.join(ROOT, "outputs/v6-crops/elem-04.png")  # the doll, biggest single element
KOUKOUTU_KEY = "CoDiyehe0qpQ5AMeQhSKU55A6CnqmLP2"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit/537.36 Chrome/120.0.0.0"
OUT = os.path.join(ROOT, "outputs/v6-keyed-probe.png")
RESP_LOG = os.path.join(ROOT, "outputs/v6-keyed-probe-response.txt")

with open(CROP, "rb") as f:
    raw = f.read()
b64 = base64.b64encode(raw).decode()
data_uri = f"data:image/png;base64,{b64}"
print(f"crop bytes: {len(raw)}, base64 chars: {len(b64)}")

form = urllib.parse.urlencode({
    "model_key": "background-removal",
    "image_url": data_uri,
    "output_format": "png",
}).encode()

print("POST sync.koukoutu.com/v1/create with data: URI...")
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
        status = r.status
except urllib.error.HTTPError as e:
    print(f"HTTP {e.code}")
    body = e.read()
    ctype = e.headers.get("Content-Type", "")
    status = e.code

print(f"status={status}, ctype={ctype}, bytes={len(body)}")
if "image" in ctype or body[:8] == b"\x89PNG\r\n\x1a\n":
    with open(OUT, "wb") as f:
        f.write(body)
    print(f"saved image: {OUT}")
else:
    text = body.decode("utf-8", "replace")
    print(text[:1500])
    with open(RESP_LOG, "w") as f:
        f.write(text)
    sys.exit(2)
