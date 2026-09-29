#!/usr/bin/env python3
from __future__ import annotations
import argparse, json, shutil, subprocess, sys
from pathlib import Path

REGISTRY = Path("src/providers/registry.ts")
REPL_FILE = Path(__file__).resolve().parent / "replacements.json"

def detect_root():
    which = shutil.which("opencodex")
    candidates = []
    if which:
        real = Path(which).resolve()
        if real.parent.name == "bin":
            candidates.append(real.parent.parent)
        candidates.append(real.parent)
    try:
        out = subprocess.run(["npm", "root", "-g"], capture_output=True, text=True, timeout=30)
        if out.returncode == 0:
            candidates.append(Path(out.stdout.strip()) / "@bitkyc08" / "opencodex")
    except Exception:
        pass
    for candidate in candidates:
        if candidate and (candidate / REGISTRY).is_file():
            return candidate
    raise SystemExit("could not locate the opencodex package; pass --root <dir>")

def package_version(root):
    try:
        return str(json.loads((root / "package.json").read_text()).get("version") or "unknown")
    except Exception:
        return "unknown"

def is_applied(text):
    return '"grok-4.7": ["low", "medium", "high", "xhigh"]' in text

def reps():
    items = json.loads(REPL_FILE.read_text())
    nl = chr(10)
    items.append({
        "old": '      "grok-4.20-0309-non-reasoning": ["text", "image"],' + nl + "    },",
        "new": '      "grok-4.20-0309-non-reasoning": ["text", "image"],' + nl + '      "grok-4.7": ["text", "image"],' + nl + '      "grok-4.7-build-fast": ["text", "image"],' + nl + "    },",
    })
    items.append({
        "old": '      "grok-build-0.1": 256_000,' + nl + "    },",
        "new": '      "grok-build-0.1": 256_000,' + nl + '      "grok-4.7": 500_000,' + nl + '      "grok-4.7-build-fast": 500_000,' + nl + "    },",
    })
    return items

def transform(text):
    out = text
    for item in reps():
        old, new = item["old"], item["new"]
        if new in out:
            continue
        if old not in out:
            raise SystemExit("anchor not found: " + old[:80])
        out = out.replace(old, new, 1)
    return out

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root")
    ap.add_argument("--check", action="store_true")
    args = ap.parse_args()
    root = Path(args.root).resolve() if args.root else detect_root()
    path = root / REGISTRY
    if not path.is_file():
        raise SystemExit("missing " + str(path))
    text = path.read_text()
    if args.check:
        print(("applied" if is_applied(text) else "not applied") + "  opencodex " + package_version(root) + "  " + str(root))
        return 0 if is_applied(text) else 1
    if is_applied(text):
        print("already applied: " + str(root))
        return 0
    path.write_text(transform(text))
    print("patched xAI grok-4.7 efforts: " + str(root) + "  (opencodex " + package_version(root) + ")")
    print("restart the proxy to load it:  opencodex restart")
    return 0

if __name__ == "__main__":
    sys.exit(main())
