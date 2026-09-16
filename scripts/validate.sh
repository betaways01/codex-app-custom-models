#!/usr/bin/env bash
set -euo pipefail
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
ok() { echo -e "${GREEN}ok${NC} $1"; }
warn() { echo -e "${YELLOW}!${NC} $1"; }
fail() { echo -e "${RED}x${NC} $1"; ERRORS=$((ERRORS+1)); }
ERRORS=0
CONFIG="${OPENCODEX_HOME:-$HOME/.opencodex}/config.json"

echo "Validating $CONFIG"
[ -f "$CONFIG" ] || { fail "missing config"; exit 1; }
ok "file exists"
python3 - "$CONFIG" << 'PY'
import json, sys
path = sys.argv[1]
try:
    cfg = json.load(open(path))
except Exception as e:
    print("invalid JSON:", e)
    sys.exit(1)
errors = 0
placeholders = ("YOUR_MIMO_API_KEY_HERE", "YOUR_DEEPSEEK_API_KEY_HERE", "YOUR_GLM_API_KEY_HERE")
for name, p in cfg.get("providers", {}).items():
    if name == "openai":
        print("  skip openai")
        continue
    if not p.get("baseUrl"):
        print(f"  x {name}: missing baseUrl"); errors += 1
    key = p.get("apiKey") or ""
    if p.get("authMode") == "key" and (not key or key in placeholders):
        print(f"  ! {name}: placeholder or empty key (ok if unused)")
    else:
        print(f"  ok {name}")
sys.exit(0)
PY
ok "JSON + providers readable"
chmod 600 "$CONFIG" 2>/dev/null || true
if curl -s --max-time 3 http://127.0.0.1:10100/healthz >/dev/null 2>&1; then
  ok "proxy on :10100"
else
  warn "proxy not running"
fi
echo "done"
