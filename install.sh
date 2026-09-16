#!/usr/bin/env bash
set -euo pipefail
# curl -fsSL https://raw.githubusercontent.com/betaways01/codex-app-custom-models/main/install.sh | bash

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
ok() { echo -e "${GREEN}ok${NC} $1"; }
warn() { echo -e "${YELLOW}!${NC} $1"; }
fail() { echo -e "${RED}x${NC} $1"; exit 1; }

echo
echo "  codex-app-custom-models installer"
echo
command -v node >/dev/null 2>&1 || fail "Node.js not found: https://nodejs.org"
command -v git >/dev/null 2>&1 || fail "git not found"
ok "Node $(node --version)"

if ! command -v opencodex >/dev/null 2>&1; then
  npm i -g @bitkyc08/opencodex
fi
ok "opencodex"

WORKDIR="${TMPDIR:-/tmp}/codex-app-custom-models-install-$$"
mkdir -p "$WORKDIR"
cd "$WORKDIR"
git clone --depth 1 https://github.com/betaways01/codex-app-custom-models.git .
chmod +x scripts/*.sh
./scripts/setup.sh
cd "$HOME"
