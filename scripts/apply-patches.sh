#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
found=0
for dir in "$ROOT"/patches/*/; do
  [ -f "$dir/apply.py" ] || continue
  found=1
  echo "== $(basename "$dir")"
  python3 "$dir/apply.py" "$@"
done
if [ "$found" -eq 0 ]; then
  echo "no patches found"
  exit 0
fi
echo
echo "Restart the proxy to load them:  opencodex restart"
