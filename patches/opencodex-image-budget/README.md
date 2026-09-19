# Patch: image byte budget (fixes upstream 413 on screenshot-heavy threads)

Makes screenshot-heavy Codex threads work on providers that cap the request body. Applies the
resize ladder OpenCodex already ships for Anthropic to every routed vision provider.

## The problem

Codex keeps every screenshot in the thread as a base64 data URL and resends the whole set on every
turn. Providers cap the **request body**, not the token window, so a thread dies on bytes long
before it runs out of context.

Measured 2026-09-18 against https://api.deepseek.com using an invalid-model probe (a rejected
request bills nothing, so this cost $0):

| Request body | Result |
|---|---|
| 40 MiB | accepted |
| 47.9 MiB | accepted |
| 48 MiB | 413 Failed to buffer the request body: length limit exceeded |

The edge proxy returns the other flavour, 413 Request Entity Too Large (openresty / nginx). xAI
does the same for Grok. In practice that is about 9-10 full-resolution screenshots per request.

## What the patch does

- Runs before the adapter builds the wire body, on the wire-neutral parsed request, so every
  routed vision provider is covered (DeepSeek, MiMo, Grok, any openai-chat or responses provider).
- Age-tier resize ladder, reusing src/adapters/anthropic-image-normalize.ts:
  - newest 6 images: up to 2000 px JPEG
  - next 14: 1024 px
  - the rest: 700 px, then progressively smaller if the total still exceeds the budget
- Total image budget: **20 MiB** of base64 by default, well under the ~48 MiB wall.
- Oldest images become a one-line note only after every image is terminal-floored and the total is
  still over budget.
- Bounded CPU: at most **150** images re-encoded per pass; the oldest surplus becomes a note.
- **No-op unless the images are already over budget**, so ordinary requests are untouched.
- **Never throws**: any internal failure keeps the original payload.

## What does NOT change

Routing, model selection, reasoning effort, tools, context window, compaction, and the prompt
cache. The same image at the same tier always produces byte-identical output, so the request
prefix stays stable and provider cache hits keep working.

## Apply

    python3 patches/opencodex-image-budget/apply.py
    opencodex restart

Or apply every bundled patch:

    bash scripts/apply-patches.sh

The applier locates the global opencodex install automatically. Point it elsewhere with
--root /path/to/@bitkyc08/opencodex. It is idempotent: running it twice is safe.

Check status (exit 0 when applied):

    python3 patches/opencodex-image-budget/apply.py --check

Revert by reinstalling the package:

    npm i -g @bitkyc08/opencodex --force
    opencodex restart

## After an opencodex update

An opencodex update or npm reinstall replaces the package and removes the patch. Re-run the apply
script. setup.sh already calls scripts/apply-patches.sh, so a fresh clone is covered.

## Tuning

| Env var | Default | Meaning |
|---|---|---|
| OCX_IMAGE_BUDGET_MB | 20 | Total base64 budget for the image share of a request |
| OCX_IMAGE_BUDGET | unset | off disables the guard entirely |

Lower it if a provider still 413s; raise it if the provider allows a larger body and you want more
fidelity.

## Verified

Against opencodex 2.31.0 and DeepSeek V4.1 Flash:

| Case | Before | After |
|---|---|---|
| 9 images, 47.8 MB | 200 (just under the wall) | 200 |
| 10 images, 53.1 MB | 413 | 200, model counted 10 images |
| 25 images, 132.8 MB | 413 | 200, all 25 retained |
| 40 images, 212.5 MB | 413 | 200, upstream body 15.2 MB |
| 53 images, 49.2 MB (a real broken thread shape) | 413 | 200 in 1.5 s |
| 2 images, 10.6 MB | 200 | 200, guard returned in under 2 ms |

Cost of the guard: under budget it is a measurement plus an early return (about 1 ms). Over budget
it adds roughly 1 second per turn for 25 images, and at most about 15 s in the pathological 150+
image case. Results are cached in-process by content and tier.

## Platform notes

- macOS and Linux. The applier uses python3 and falls back to python. The proxy bundles its own Bun.
- Windows is untested. The package path layout is the only OS-specific part, handled by --root.

## Upstream

This is a local patch, not a fork. The durable fix is for OpenCodex to run its Anthropic ladder for
all image-capable adapters. Report it upstream and drop this patch once it lands.
