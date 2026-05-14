#!/usr/bin/env python3
"""Poll PoC1-B task until done."""
import json, time, urllib.request, sys, os

TASK_ID = "task_01KRJVMM8P8EYDD89V2D6JS8AK"
API_KEY = "sk-SNsVuJCDEBDKIkcnEMu7S78dqvpYKoc6RG8mX6bi7dU1Wo1I"
UA = "Mozilla/5.0"
OUT = "/Users/lijiakun/Documents/img2UI/poc/v12-multi-route/outputs"

for i in range(180):  # 180 * 15s = 45 min
    req = urllib.request.Request(
        f"https://api.apimart.ai/v1/tasks/{TASK_ID}",
        headers={"Authorization": f"Bearer {API_KEY}", "User-Agent": UA},
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            data = json.loads(r.read().decode())
    except Exception as e:
        print(f"poll #{i+1}: error {e}", flush=True)
        time.sleep(15)
        continue
    d = data.get("data", {})
    st = d.get("status", "?")
    pr = d.get("progress", "?")
    print(f"poll #{i+1}: status={st} progress={pr}", flush=True)
    if st in ("completed", "succeeded", "success"):
        with open(f"{OUT}/poc1-B-poll.json", "w") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        imgs = d.get("result", {}).get("images", [])
        if imgs:
            url = imgs[0].get("url")
            if isinstance(url, list):
                url = url[0]
            req2 = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req2, timeout=90) as r:
                img_data = r.read()
            with open(f"{OUT}/poc1-B.png", "wb") as f:
                f.write(img_data)
            print(f"Downloaded {len(img_data)} bytes -> {OUT}/poc1-B.png", flush=True)
        sys.exit(0)
    if st in ("failed", "error"):
        print(f"FAILED: {data}", flush=True)
        sys.exit(1)
    time.sleep(15)
print("TIMEOUT after 45 min", flush=True)
sys.exit(2)
