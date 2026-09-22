# Patch: current-turn images (413 + cache)

Keeps screenshot-heavy Codex threads working on DeepSeek, Grok, MiMo, and GLM Flash
without blowing the request-body cap or busting DeepSeek prefix cache.

## The problem

Codex resends every screenshot as a base64 data URL on every turn.

1. Providers cap the **request body**, not the token window. DeepSeek accepts 47.9 MiB
   and 413s at 48 MiB. About 9-10 full-resolution screenshots hit the wall.
2. DeepSeek cache-miss is **50x** a cache-hit. The previous age-tier resize ladder
   rewrote early screenshots whenever a new one arrived, which invalidated the entire
   cached prefix. Long frontend threads then billed like cold starts.

## What the patch does (default)

Frontend sprint: view, understand, work, test, forget.

- Images in the **latest user/developer message**, plus tool screenshots after it, stay.
- Images from **earlier turns** become the fixed stub `[earlier screenshot omitted]`.
  The string never changes, so the prefix is append-only after each turn ages out.
- Kept images are encoded at most once (max edge 1280 px JPEG), content-addressed
  in process. New screenshots sit at the **end** of the prefix and cannot bust cache.
- Emergency cap **40 MiB** on the kept set (DeepSeek wall ~48 MiB).
- Text-only models are untouched (sidecar / strip path).
- Never throws. Set OCX_IMAGE_BUDGET=off to disable.

Routing, model selection, reasoning effort, tools, and compaction do not change.

## Apply

    python3 patches/opencodex-image-budget/apply.py
    opencodex restart

Or every bundled patch:

    bash scripts/apply-patches.sh

The applier locates the global opencodex install. Re-running copies the latest
module over an existing install.

    python3 patches/opencodex-image-budget/apply.py --check

Revert by reinstalling the package:

    npm i -g @bitkyc08/opencodex --force
    opencodex restart

## After an opencodex update

Re-run the apply script. setup.sh already calls scripts/apply-patches.sh.

## Tuning

- OCX_IMAGE_BUDGET (default unset): off disables the guard
- OCX_IMAGE_HISTORY (default unset): keep freeze-encodes all history instead of stubbing old turns
- OCX_IMAGE_BUDGET_MB (default 40): emergency cap on the kept image share
- OCX_IMAGE_MAX_EDGE (default 1280): longest side for kept screenshots
- OCX_IMAGE_JPEG_QUALITY (default 70): JPEG quality when re-encoding

OCX_IMAGE_HISTORY=keep is the escape hatch if a thread must keep seeing older
screenshots. It still freeze-encodes so bytes do not change after first sight.

## Why this is cheaper on DeepSeek

A 500k-token turn at 99% cache is about $0.002 off-peak. The same turn at 2% cache
is about $0.08, sixteen cents in peak. Stubbing old images means each new screenshot
is appended, not a rewrite of image 0, so cache can stay in the 99% band after the
one-time aging-out of the previous turn.

## Tests

    python3 patches/opencodex-image-budget/apply.py
    bun patches/opencodex-image-budget/image-budget.test.ts

The test file imports the installed module after apply.py has copied it.

## Platform notes

macOS and Linux. Windows untested. The proxy bundles its own Bun.
