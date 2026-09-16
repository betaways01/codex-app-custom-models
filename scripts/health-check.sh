#!/usr/bin/env bash
set -euo pipefail
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
ok() { echo -e "${GREEN}ok${NC} $1"; }
fail() { echo -e "${RED}x${NC} $1"; }

echo "Health check"
if ! curl -s --max-time 3 http://127.0.0.1:10100/healthz >/dev/null 2>&1; then
  fail "proxy not running: opencodex restart"
  exit 1
fi
ok "proxy up"
echo "Provider pings (skip if that key is unused):"
echo "  opencodex provider test mimo"
echo "  opencodex provider test deepseek"
echo "  opencodex provider test zai"
echo "  opencodex provider test xai"
command -v opencodex >/dev/null && opencodex provider test mimo >/dev/null 2>&1 && ok "mimo" || fail "mimo (expected if no key)"
command -v opencodex >/dev/null && opencodex provider test deepseek >/dev/null 2>&1 && ok "deepseek" || fail "deepseek (expected if no key)"
