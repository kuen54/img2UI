#!/usr/bin/env python3
"""Path B Step 3: koukoutu background-removal on each v9b crop."""
import base64, json, os, time, urllib.parse, urllib.request, urllib.error
from io import BytesIO
from PIL import Image

ROOT = "/Users/lijiakun/Documents/img2UI/poc"
MIN_SIDE = 80  # koukoutu requires >= 70 px; bump above to be safe
CROP_DIR = os.path.join(ROOT, "outputs/v9b-crops")
KEYED_DIR = os.path.join(ROOT, "outputs/v9b-elements")
SUMMARY = os.path.join(ROOT, "outputs/v9b-elements-summary.json")
KOUKOUTU_KEY = "CoDiyehe0qpQ5AMeQhSKU55A6CnqmLP2"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit/537.36 Chrome/120.0.0.0"

# Skip background_image (it IS the background — no point in removing bg)
SKIP = {"background_image.png"}


def key_one(crop_path: str, out_path: str) -> dict:
    # Upscale if too small for koukoutu
    img = Image.open(crop_path)
    w, h = img.size
    scale = 1.0
    if min(w, h) < MIN_SIDE:
        scale = MIN_SIDE / min(w, h)
        new_size = (int(round(w * scale)), int(round(h * scale)))
        img = img.resize(new_size, Image.LANCZOS)
    buf = BytesIO()
    img.save(buf, format="PNG")
    raw = buf.getvalue()
    b64 = base64.b64encode(raw).decode()
    form = urllib.parse.urlencode({
        "model_key": "background-removal",
        "image_url": f"data:image/png;base64,{b64}",
        "output_format": "png",
    }).encode()
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
    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=180) as r:
            body = r.read()
            ctype = r.headers.get("Content-Type", "")
    except urllib.error.HTTPError as e:
        body_err = e.read().decode("utf-8", "replace")
        return {"ok": False, "status": e.code, "error": body_err[:300]}
    dt = time.time() - t0
    if "image" in ctype or body[:8] == b"\x89PNG\r\n\x1a\n":
        with open(out_path, "wb") as f:
            f.write(body)
        return {"ok": True, "bytes": len(body), "elapsed_s": round(dt, 2), "scale": scale, "src_size": [w, h]}
    text = body.decode("utf-8", "replace")
    return {"ok": False, "status": 200, "error": text[:300]}


def main():
    os.makedirs(KEYED_DIR, exist_ok=True)
    crops = sorted(f for f in os.listdir(CROP_DIR) if f.endswith(".png") and f not in SKIP)
    print(f"crops to key: {len(crops)} (skipping {SKIP})")

    results = {}
    for name in crops:
        crop = os.path.join(CROP_DIR, name)
        out = os.path.join(KEYED_DIR, name)
        print(f"  -> {name} ...", end=" ", flush=True)
        r = key_one(crop, out)
        results[name] = r
        if r["ok"]:
            print(f"OK {r['bytes']}b {r['elapsed_s']}s")
        else:
            print(f"FAIL: {r}")

    with open(SUMMARY, "w") as f:
        json.dump(results, f, indent=2, ensure_ascii=False)
    ok = sum(1 for r in results.values() if r["ok"])
    print(f"\n{ok}/{len(results)} succeeded")


if __name__ == "__main__":
    main()
