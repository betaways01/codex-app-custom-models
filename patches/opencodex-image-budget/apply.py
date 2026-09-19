#!/usr/bin/env python3
"""
Wire the image byte-budget guard into an installed @bitkyc08/opencodex.

Why: Codex resends every screenshot as base64 on every turn. Upstreams cap the
REQUEST BODY (DeepSeek accepts 47.9 MiB, rejects 48 MiB), not the token window, so a
screenshot-heavy thread dies with 413 long before it runs out of context. Anthropic
already ships a resize ladder; this makes the same ladder apply to every routed
vision provider. No-op unless the image payload is already over budget.

Usage:
    python3 apply.py                 # detect the global install and patch it
    python3 apply.py --root <dir>    # patch a specific package root
    python3 apply.py --check         # exit 0 if applied, 1 if not
"""
from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path

MODULE_SRC = Path(__file__).resolve().parent / "image-budget.ts"
MODULE_DST = Path("src/vision/image-budget.ts")
INDEX = Path("src/vision/index.ts")
CORE = Path("src/server/responses/core.ts")

INDEX_ANCHOR = 'export { describeImageAnthropic, parseAnthropicVisionSSE } from "./anthropic-describe";'
INDEX_ADD = 'export { enforceImageByteBudget, DEFAULT_IMAGE_BASE64_BUDGET } from "./image-budget";'

IMPORT_OLD = 'import { describeImagesInPlace, isModelTextOnly, planVisionSidecar, resolveOpenAiVisionModel, shouldResolveOpenAiVisionSidecar, stripImagesInPlace } from "../../vision";'
IMPORT_NEW = 'import { describeImagesInPlace, enforceImageByteBudget, isModelTextOnly, planVisionSidecar, resolveOpenAiVisionModel, shouldResolveOpenAiVisionSidecar, stripImagesInPlace } from "../../vision";'

STRIP_CALL = "stripImagesInPlace(parsed, translatorBudget);"
ELSE_ADD = """
  } else {
    // Vision-capable routed model: bound the image share of the body so a screenshot-heavy thread
    // cannot exceed the provider's request-body limit (DeepSeek 413s at ~48 MiB). No-op unless the
    // combined base64 is over budget, so ordinary requests are untouched.
    await enforceImageByteBudget(parsed);
  }"""


def package_version(root: Path) -> str:
    """Report the installed opencodex version, for support and upgrade notes."""
    try:
        data = json.loads((root / "package.json").read_text())
        return str(data.get("version") or "unknown")
    except Exception:
        return "unknown"


def detect_root() -> Path:
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
        if candidate and (candidate / "src" / "vision" / "index.ts").is_file():
            return candidate
    raise SystemExit("could not locate the opencodex package; pass --root <dir>")


def index_edit(text: str) -> str:
    if INDEX_ADD in text:
        return text
    if INDEX_ANCHOR not in text:
        raise SystemExit("anchor not found in vision/index.ts")
    return text.replace(INDEX_ANCHOR, INDEX_ANCHOR + chr(10) + INDEX_ADD, 1)


def import_edit(text: str) -> str:
    if IMPORT_NEW in text:
        return text
    if IMPORT_OLD not in text:
        raise SystemExit("anchor not found in responses/core.ts import block")
    return text.replace(IMPORT_OLD, IMPORT_NEW, 1)


def core_edit(text: str) -> str:
    if "enforceImageByteBudget(parsed)" in text:
        return text
    pos = text.find(STRIP_CALL)
    if pos == -1:
        raise SystemExit("anchor not found in responses/core.ts: " + STRIP_CALL)
    close = text.find(chr(10) + "  }", text.find(chr(10), pos))
    if close == -1:
        raise SystemExit("could not find the closing brace of the text-only branch")
    return text[:close] + ELSE_ADD + text[close + 4:]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--root")
    ap.add_argument("--check", action="store_true")
    args = ap.parse_args()

    root = Path(args.root).resolve() if args.root else detect_root()
    idx, core = root / INDEX, root / CORE
    for path in (idx, core):
        if not path.is_file():
            raise SystemExit("not an opencodex package root, missing " + str(path))

    applied = (root / MODULE_DST).is_file() and "enforceImageByteBudget(parsed)" in core.read_text()

    if args.check:
        state = "applied" if applied else "not applied"
        print(state + "  opencodex " + package_version(root) + "  " + str(root))
        return 0 if applied else 1

    if applied:
        print("already applied, nothing to do: " + str(root))
        return 0

    if not MODULE_SRC.is_file():
        raise SystemExit("missing module source next to apply.py: " + str(MODULE_SRC))

    dst = root / MODULE_DST
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(MODULE_SRC, dst)

    idx.write_text(index_edit(idx.read_text()))
    core_text = core.read_text()
    core.write_text(core_edit(import_edit(core_text)))

    print("patched: " + str(root) + "  (opencodex " + package_version(root) + ")")
    print("restart the proxy to load it:  opencodex restart")
    return 0


if __name__ == "__main__":
    sys.exit(main())
