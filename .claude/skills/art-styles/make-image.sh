#!/bin/bash
# Usage: make-image.sh "<prompt>" <output.png> [reference.jpg]
# Generates an image with Gemini's image model using GEMINI_API_KEY.
set -euo pipefail

PROMPT="$1"
OUT="$2"
REF="${3:-}"

if [ -z "${GEMINI_API_KEY:-}" ]; then
  echo "GEMINI_API_KEY is not set" >&2
  exit 1
fi

BODY=$(mktemp)
RESP=$(mktemp)
trap 'rm -f "$BODY" "$RESP"' EXIT

python3 - "$PROMPT" "$REF" > "$BODY" <<'EOF'
import base64, json, sys
prompt, ref = sys.argv[1], sys.argv[2]
parts = [{"text": prompt}]
if ref:
    with open(ref, "rb") as f:
        parts.append({"inline_data": {"mime_type": "image/jpeg", "data": base64.b64encode(f.read()).decode()}})
print(json.dumps({"contents": [{"parts": parts}], "generationConfig": {"responseModalities": ["TEXT", "IMAGE"]}}))
EOF

for MODEL in ${GEMINI_IMAGE_MODEL:-gemini-3.1-flash-image-preview gemini-2.5-flash-image}; do
  CODE=$(curl -sS -o "$RESP" -w '%{http_code}' -X POST \
    "https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent" \
    -H "x-goog-api-key: ${GEMINI_API_KEY}" -H "Content-Type: application/json" \
    --data-binary @"$BODY")
  if [ "$CODE" = "200" ]; then
    python3 - "$RESP" "$OUT" <<'EOF'
import base64, json, sys
resp = json.load(open(sys.argv[1]))
for part in resp["candidates"][0]["content"]["parts"]:
    data = part.get("inlineData") or part.get("inline_data")
    if data:
        open(sys.argv[2], "wb").write(base64.b64decode(data["data"]))
        print(sys.argv[2])
        sys.exit(0)
sys.exit("Gemini returned no image: " + json.dumps(resp)[:500])
EOF
    exit 0
  fi
  echo "${MODEL}: HTTP ${CODE} $(head -c 300 "$RESP")" >&2
done
exit 1
