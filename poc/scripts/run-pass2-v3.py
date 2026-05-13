#!/usr/bin/env python3
"""Pass 2 v3 runner: apimart gpt-image-2 with description-driven prompt."""
import base64, json, os, sys, time, urllib.request

ROOT = "/Users/lijiakun/Documents/img2UI/poc"
PROMPT_PATH = os.path.join(ROOT, "prompts/pass2-v3.txt")
INPUT_IMAGE = os.path.join(ROOT, "inputs/canonical-512.png")
OUT_SUBMIT = os.path.join(ROOT, "outputs/v3-pass2-submit.json")
OUT_POLL = os.path.join(ROOT, "outputs/v3-pass2-poll.json")
OUT_IMG = os.path.join(ROOT, "outputs/v3-pass2.png")

API_BASE = "https://api.apimart.ai/v1"
API_KEY = "sk-SNsVuJCDEBDKIkcnEMu7S78dqvpYKoc6RG8mX6bi7dU1Wo1I"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit/537.36 Chrome/120.0.0.0"

with open(PROMPT_PATH) as f:
    prompt = f.read()
with open(INPUT_IMAGE, "rb") as f:
    img_b64 = base64.b64encode(f.read()).decode()

print(f"Prompt: {len(prompt)} chars")
print(f"Image base64: {len(img_b64)} chars")

payload = {
    "model": "gpt-image-2",
    "prompt": prompt,
    "image_urls": [f"data:image/png;base64,{img_b64}"],
    "size": "1:1",
    "resolution": "1k",
    "n": 1,
}
body = json.dumps(payload).encode()
print(f"Payload: {len(body)} bytes")

# 1. Submit
print("\n[1/3] Submitting...")
req = urllib.request.Request(
    f"{API_BASE}/images/generations",
    data=body,
    headers={"Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json"},
    method="POST",
)
try:
    with urllib.request.urlopen(req, timeout=30) as r:
        submit_raw = r.read().decode()
except urllib.error.HTTPError as e:
    print(f"HTTP {e.code}: {e.read().decode()}")
    sys.exit(1)

with open(OUT_SUBMIT, "w") as f:
    f.write(submit_raw)
submit = json.loads(submit_raw)
print(json.dumps(submit, ensure_ascii=False)[:600])
if submit.get("code") != 200:
    print(f"submit failed: {submit}")
    sys.exit(1)
task_id = submit["data"][0]["task_id"]
print(f"task_id: {task_id}")

# 2. Poll
print("\n[2/3] Polling...")
time.sleep(12)
final = None
for i in range(24):
    elapsed = 12 + i * 5
    print(f"  poll #{i+1} ({elapsed}s)...")
    req = urllib.request.Request(
        f"{API_BASE}/tasks/{task_id}",
        headers={"Authorization": f"Bearer {API_KEY}"},
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            poll_raw = r.read().decode()
    except Exception as e:
        print(f"   error: {e}")
        time.sleep(5)
        continue
    poll = json.loads(poll_raw)
    status = poll.get("data", {}).get("status", "unknown")
    print(f"    status: {status}")
    if status in ("completed", "succeeded", "success"):
        final = poll
        break
    if status in ("failed", "error"):
        print(json.dumps(poll, ensure_ascii=False)[:1500])
        sys.exit(1)
    time.sleep(5)

if not final:
    print("Timed out")
    sys.exit(1)

with open(OUT_POLL, "w") as f:
    json.dump(final, f, ensure_ascii=False, indent=2)

# 3. Download
print("\n[3/3] Downloading image...")
images = final["data"]["result"]["images"]
img_obj = images[0]
url = img_obj.get("url")
if isinstance(url, list):
    url = url[0]
print(f"URL: {url}")

req = urllib.request.Request(url, headers={"User-Agent": UA})
with urllib.request.urlopen(req, timeout=60) as r:
    data = r.read()
with open(OUT_IMG, "wb") as f:
    f.write(data)
print(f"Saved: {OUT_IMG} ({len(data)} bytes)")

from PIL import Image
img = Image.open(OUT_IMG)
print(f"Size: {img.size}, Mode: {img.mode}")
