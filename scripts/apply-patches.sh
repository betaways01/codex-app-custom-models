#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# Portable interpreter lookup: prefer python3, fall back to python.
PY=""
for candidate in python3 python; do
  if command -v "$candidate" >/dev/null 2>&1; then PY="$candidate"; break; fi
done
if [ -z "$PY" ]; then
  echo "python is required to apply the bundled patches; install python3" >&2
  exit 1
fi

if ! command -v opencodex >/dev/null 2>&1; then
  echo "opencodex not found on PATH; install it first:  npm i -g @bitkyc08/opencodex" >&2
  exit 1
fi

found=0
for dir in "$ROOT"/patches/*/; do
  [ -f "$dir/apply.py" ] || continue
  found=1
  echo "== $(basename "$dir")"
  "$PY" "$dir/apply.py" "$@"
done

if [ "$found" -eq 0 ]; then
  echo "no patches found"
  exit 0
fi
echo
echo "Restart the proxy to load them:  opencodex restart"
