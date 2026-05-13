#!/usr/bin/env bash
# apimart gpt-image-2 完整探针脚本
# 使用: bash probe-apimart.sh <prompt-file>

set -e
cd "$(dirname "$0")/.."

API_BASE="https://api.apimart.ai/v1"
API_KEY="sk-SNsVuJCDEBDKIkcnEMu7S78dqvpYKoc6RG8mX6bi7dU1Wo1I"

PROMPT_FILE="${1:-prompts/single-doll.txt}"
INPUT_IMAGE="${2:-inputs/canonical-512.png}"
OUTPUT_PREFIX="${3:-outputs/apimart}"

echo "=== Probe apimart gpt-image-2 ==="
echo "Prompt:     $PROMPT_FILE"
echo "Input img:  $INPUT_IMAGE ($(file -b "$INPUT_IMAGE"))"
echo "Output:     $OUTPUT_PREFIX-*.json/.png"
echo

# 1. 准备 base64
B64=$(base64 -i "$INPUT_IMAGE" | tr -d '\n')
echo "Base64 length: ${#B64}"

# 2. 准备 payload (image_urls 接受 URL 或 base64,这里直接 base64)
PROMPT=$(cat "$PROMPT_FILE")
cat > /tmp/apimart-payload.json <<EOF
{
  "model": "gpt-image-2",
  "prompt": $(echo "$PROMPT" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))'),
  "image_urls": ["data:image/png;base64,${B64}"],
  "size": "1:1",
  "resolution": "1k",
  "n": 1
}
EOF
echo "Payload size: $(wc -c < /tmp/apimart-payload.json)"

# 3. 提交任务
echo
echo "[1/3] Submit task..."
SUBMIT_RES=$(curl -sS -w "\n---HTTP: %{http_code}\n---TIME: %{time_total}s\n" \
  --location "${API_BASE}/images/generations" \
  --header "Authorization: Bearer ${API_KEY}" \
  --header "Content-Type: application/json" \
  --max-time 30 \
  --data @/tmp/apimart-payload.json)
echo "$SUBMIT_RES" | tee "${OUTPUT_PREFIX}-submit.json"

# 4. 提取 task_id
TASK_ID=$(echo "$SUBMIT_RES" | python3 -c "
import json, sys, re
text = sys.stdin.read()
# 取 ---HTTP 之前的 JSON 部分
body = text.split('---HTTP')[0].strip()
data = json.loads(body)
if data.get('code') != 200:
    print(f'ERROR: {data}', file=sys.stderr)
    sys.exit(1)
task_id = data['data'][0]['task_id']
print(task_id)
")
echo
echo "Task ID: $TASK_ID"

# 5. 轮询 task 直到完成(每 5s 一次,最多 90s)
echo
echo "[2/3] Polling task status..."
sleep 12  # 文档建议 10-20s 后开始轮询

for i in {1..18}; do
  echo "  poll #$i ($((i*5+12))s elapsed)..."
  POLL_RES=$(curl -sS \
    --location "${API_BASE}/tasks/${TASK_ID}" \
    --header "Authorization: Bearer ${API_KEY}" \
    --max-time 15)
  STATUS=$(echo "$POLL_RES" | python3 -c "
import json, sys
data = json.load(sys.stdin)
result = data.get('data', {}).get('result', {})
status = data.get('data', {}).get('status', 'unknown')
print(status)
")
  echo "    status: $STATUS"
  if [ "$STATUS" = "completed" ] || [ "$STATUS" = "succeeded" ] || [ "$STATUS" = "success" ]; then
    echo "$POLL_RES" > "${OUTPUT_PREFIX}-poll.json"
    break
  fi
  if [ "$STATUS" = "failed" ] || [ "$STATUS" = "error" ]; then
    echo "Task failed:"
    echo "$POLL_RES"
    exit 1
  fi
  sleep 5
done

# 6. 下载图片 + 分析
echo
echo "[3/3] Download & analyze..."
python3 <<PYEOF
import json, base64, urllib.request, sys
with open("${OUTPUT_PREFIX}-poll.json") as f:
    data = json.load(f)

print('Full response:')
print(json.dumps(data, indent=2, ensure_ascii=False)[:2000])
print()

# 从结构里找图片 URL
result = data.get('data', {}).get('result', {})
images = result.get('images', [])
if not images:
    print("ERROR: no images in result")
    sys.exit(1)

img_obj = images[0]
url = img_obj.get('url')
if isinstance(url, list):
    url = url[0]
print(f'Image URL: {url}')

# 下载
req = urllib.request.Request(url)
with urllib.request.urlopen(req, timeout=30) as r:
    img_bytes = r.read()
out_path = "${OUTPUT_PREFIX}-decoded.png"
with open(out_path, 'wb') as f:
    f.write(img_bytes)
print(f'Saved: {out_path} ({len(img_bytes)} bytes)')

# 分析
from PIL import Image
img = Image.open(out_path)
print(f'Mode: {img.mode}, Size: {img.size}')
print(f'Has alpha: {"A" in img.mode}')
if 'A' in img.mode:
    alpha = img.split()[-1]
    pixels = list(alpha.getdata())
    trans = sum(1 for p in pixels if p < 32)
    semi = sum(1 for p in pixels if 32 <= p < 224)
    opaque = sum(1 for p in pixels if p >= 224)
    print(f'  Transparent (<32): {trans*100/len(pixels):.1f}%')
    print(f'  Semi (32-224):     {semi*100/len(pixels):.1f}%')
    print(f'  Opaque (>=224):    {opaque*100/len(pixels):.1f}%')
PYEOF

echo
echo "=== Done ==="
