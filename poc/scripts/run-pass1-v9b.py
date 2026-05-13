#!/usr/bin/env python3
"""Pass 1 v9b runner: gemini-3.1-pro-preview, temperature=1, normalized bbox enforced"""
import base64, json, sys, os, urllib.request, time

ROOT = "/Users/lijiakun/Documents/img2UI/poc"
SYSTEM_PROMPT_PATH = os.path.join(ROOT, "prompts/pass1-system-v9b.txt")
INPUT_IMAGE = os.path.join(ROOT, "inputs/canonical-512.png")
OUT_RAW = os.path.join(ROOT, "outputs/v9b-pass1-raw.json")
OUT_PARSED = os.path.join(ROOT, "outputs/v9b-pass1.json")

API_URL = "https://aigc.sankuai.com/v1/openai/native/chat/completions"
API_KEY = "1983731511187542037"  # NO Bearer prefix

with open(SYSTEM_PROMPT_PATH) as f:
    system_prompt = f.read()

with open(INPUT_IMAGE, "rb") as f:
    img_b64 = base64.b64encode(f.read()).decode()

print(f"System prompt: {len(system_prompt)} chars")
print(f"Image base64: {len(img_b64)} chars")

payload = {
    "stream": False,
    "model": "gemini-3.1-pro-preview",
    "temperature": 1.0,
    "max_tokens": 12000,
    "response_format": {"type": "json_object"},
    "extra_body": {
        "google": {"thinking_config": {"include_thoughts": False, "thinking_budget": 4096}}
    },
    "messages": [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": [
            {"type": "text", "text": "Page name: 奶茶盲盒-抽中页\nState: canonical\nBe EXHAUSTIVE. CRITICAL: bbox MUST be normalized 0-1 floats (no pixel values). Return JSON."},
            {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{img_b64}"}}
        ]}
    ]
}

body = json.dumps(payload).encode()
print(f"Payload size: {len(body)} bytes")

req = urllib.request.Request(
    API_URL,
    data=body,
    headers={
        "Authorization": API_KEY,
        "Content-Type": "application/json",
    },
    method="POST",
)

print("Calling sankuai gateway...")
t0 = time.time()
try:
    with urllib.request.urlopen(req, timeout=240) as resp:
        raw = resp.read().decode()
except urllib.error.HTTPError as e:
    print(f"HTTP {e.code}: {e.read().decode()[:1000]}")
    sys.exit(1)
elapsed = time.time() - t0
print(f"Done in {elapsed:.1f}s, response size: {len(raw)} bytes")

with open(OUT_RAW, "w") as f:
    f.write(raw)

resp_data = json.loads(raw)
content = resp_data["choices"][0]["message"]["content"]
print(f"Content length: {len(content)} chars")

parsed = json.loads(content)
with open(OUT_PARSED, "w") as f:
    json.dump(parsed, f, ensure_ascii=False, indent=2)

elements = parsed.get("elements", [])
print(f"\nElements: {len(elements)}")
static_count = sum(1 for e in elements if e.get("type") == "static")
code_count = sum(1 for e in elements if e.get("type") == "code")
print(f"  static: {static_count}, code: {code_count}")

# Validation: bbox normalized?
bad = 0
for i, e in enumerate(elements):
    bbox = e.get("bbox", [])
    if len(bbox) == 4:
        max_v = max(bbox)
        if max_v > 1.5:
            print(f"  WARN element[{i}] {e.get('entity_name')}: NOT normalized: {bbox}")
            bad += 1
print(f"  bad bbox count: {bad}/{len(elements)}")

print(f"\nSaved: {OUT_PARSED}")
